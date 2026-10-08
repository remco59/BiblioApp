import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { FineDto, LoanDto, MemberDetailDto, MemberDto } from './dto';
import { DomainError } from './errors';
import { fineInclude, LoansService, loanInclude, toFineDto } from './loans.service';
import { SettingsService } from './settings.service';

const memberInclude = {
  user: { select: { id: true, name: true, email: true } },
} satisfies Prisma.MemberInclude;
type MemberRow = Prisma.MemberGetPayload<{ include: typeof memberInclude }>;

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loans: LoansService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  private async toDto(m: MemberRow): Promise<MemberDto> {
    const now = new Date();
    const [activeLoans, overdueLoans, outstanding] = await Promise.all([
      this.prisma.loan.count({ where: { memberId: m.id, returnedAt: null } }),
      this.prisma.loan.count({ where: { memberId: m.id, returnedAt: null, dueAt: { lt: now } } }),
      this.loans.outstandingFines(m.id),
    ]);
    return {
      id: m.id,
      userId: m.userId,
      memberNumber: m.memberNumber,
      name: m.user.name,
      email: m.user.email,
      membershipUntil: m.membershipUntil.toISOString(),
      membershipValid: m.membershipUntil >= now,
      blocked: m.blocked,
      blockedReason: m.blockedReason,
      activeLoans,
      overdueLoans,
      outstandingFinesCents: outstanding,
    };
  }

  async search(q?: string): Promise<MemberDto[]> {
    const term = q?.trim();
    const rows = await this.prisma.member.findMany({
      where: term
        ? {
            OR: [
              { memberNumber: { equals: term, mode: 'insensitive' } },
              { user: { name: { contains: term, mode: 'insensitive' } } },
              { user: { email: { contains: term, mode: 'insensitive' } } },
            ],
          }
        : undefined,
      include: memberInclude,
      orderBy: { memberNumber: 'asc' },
      take: 25,
    });
    return Promise.all(rows.map((r) => this.toDto(r)));
  }

  async findRow(id: number): Promise<MemberRow> {
    const m = await this.prisma.member.findUnique({ where: { id }, include: memberInclude });
    if (!m) throw new DomainError('Lid niet gevonden', 'MEMBER_NOT_FOUND', HttpStatus.NOT_FOUND);
    return m;
  }

  async detail(id: number): Promise<MemberDetailDto> {
    return this.detailOf(await this.findRow(id));
  }

  async detailByUser(userId: number): Promise<MemberDetailDto> {
    const m = await this.prisma.member.findUnique({ where: { userId }, include: memberInclude });
    if (!m)
      throw new DomainError(
        'Geen lidmaatschap bij dit account',
        'MEMBER_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    return this.detailOf(m);
  }

  private async detailOf(m: MemberRow): Promise<MemberDetailDto> {
    const [base, loans, fines] = await Promise.all([
      this.toDto(m),
      this.memberLoans(m.id),
      this.memberFines(m.id),
    ]);
    return { ...base, loans, fines };
  }

  async memberLoans(memberId: number): Promise<LoanDto[]> {
    const [rows, s] = await Promise.all([
      this.prisma.loan.findMany({
        where: { memberId },
        include: loanInclude,
        orderBy: [{ returnedAt: { sort: 'asc', nulls: 'first' } }, { loanedAt: 'desc' }],
      }),
      this.settings.getAll(),
    ]);
    return rows.map((l) => this.loans.toDto(l, s));
  }

  async memberFines(memberId: number): Promise<FineDto[]> {
    const rows = await this.prisma.fine.findMany({
      where: { memberId },
      include: fineInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toFineDto);
  }

  async setBlocked(
    id: number,
    blocked: boolean,
    reason: string | undefined,
    actorId: number,
  ): Promise<MemberDto> {
    await this.findRow(id);
    const m = await this.prisma.member.update({
      where: { id },
      data: { blocked, blockedReason: blocked ? (reason ?? null) : null },
      include: memberInclude,
    });
    await this.audit.log(blocked ? 'member.block' : 'member.unblock', actorId, {
      memberId: id,
      reason: reason ?? null,
    });
    return this.toDto(m);
  }

  /** Verlengt het lidmaatschap vanaf de einddatum (of vanaf nu als dat al verlopen is). */
  async extend(id: number, months: number | undefined, actorId: number): Promise<MemberDto> {
    const row = await this.findRow(id);
    const s = await this.settings.getAll();
    const base = row.membershipUntil > new Date() ? row.membershipUntil : new Date();
    const until = new Date(base);
    until.setMonth(until.getMonth() + (months ?? s.membershipMonths));
    const m = await this.prisma.member.update({
      where: { id },
      data: { membershipUntil: until },
      include: memberInclude,
    });
    await this.audit.log('member.extend', actorId, { memberId: id, until: until.toISOString() });
    return this.toDto(m);
  }

  async payFine(
    fineId: number,
    amountCents: number,
    method: string,
    actorId: number,
  ): Promise<FineDto> {
    await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<
        { id: number }[]
      >`SELECT "id" FROM "Fine" WHERE "id" = ${fineId} FOR UPDATE`;
      if (!locked)
        throw new DomainError('Boete niet gevonden', 'FINE_NOT_FOUND', HttpStatus.NOT_FOUND);
      const f = await tx.fine.findUniqueOrThrow({
        where: { id: fineId },
        include: { payments: true },
      });
      if (f.waivedAt) throw new DomainError('Boete is kwijtgescholden', 'FINE_WAIVED');
      const outstanding = f.amountCents - f.payments.reduce((s, p) => s + p.amountCents, 0);
      if (outstanding <= 0) throw new DomainError('Boete is al betaald', 'FINE_PAID');
      if (amountCents > outstanding)
        throw new DomainError(
          'Bedrag is hoger dan het openstaande bedrag',
          'AMOUNT_TOO_HIGH',
          HttpStatus.BAD_REQUEST,
        );
      await tx.payment.create({ data: { fineId, amountCents, method, receivedById: actorId } });
    });
    await this.audit.log('fine.pay', actorId, { fineId, amountCents, method });
    return this.loans.fine(fineId);
  }

  async waiveFine(fineId: number, actorId: number): Promise<FineDto> {
    const f = await this.prisma.fine.findUnique({ where: { id: fineId } });
    if (!f) throw new DomainError('Boete niet gevonden', 'FINE_NOT_FOUND', HttpStatus.NOT_FOUND);
    await this.prisma.fine.update({
      where: { id: fineId },
      data: { waivedAt: new Date(), waivedById: actorId },
    });
    await this.audit.log('fine.waive', actorId, { fineId });
    return this.loans.fine(fineId);
  }
}
