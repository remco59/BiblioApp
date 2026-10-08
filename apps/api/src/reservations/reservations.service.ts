import { HttpStatus, Injectable } from '@nestjs/common';
import { Notification, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { DomainError } from '../loans/errors';
import { SettingsService } from '../loans/settings.service';
import { EventsService } from '../notifications/events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CommunityService } from '../community/community.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReservationDto } from './dto';

const DAY = 24 * 3600 * 1000;
type Tx = Prisma.TransactionClient;

const include = {
  book: { select: { title: true } },
  member: { include: { user: { select: { name: true } } } },
} satisfies Prisma.ReservationInclude;
type Row = Prisma.ReservationGetPayload<{ include: typeof include }>;

export interface QueueEffects {
  notifications: Notification[];
  bookIds: number[];
  /** Gebruikers die géén verlanglijst-melding krijgen (bijv. wie het boek net zelf inleverde). */
  skipWishlistUserIds?: number[];
}

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly events: EventsService,
    private readonly audit: AuditService,
    private readonly community: CommunityService,
  ) {}

  /** Realtime + e-mail na een gecommitte wijziging. */
  async publish(effects: QueueEffects) {
    for (const bookId of new Set(effects.bookIds))
      this.events.emit({ type: 'availability', bookId });
    await this.notifications.dispatch(effects.notifications);
    // Verlanglijst: boek is (weer) beschikbaar gekomen
    for (const bookId of new Set(effects.bookIds))
      await this.community.notifyWishlistAvailable(bookId, effects.skipWishlistUserIds);
  }

  private async toDto(r: Row): Promise<ReservationDto> {
    const position =
      r.status === 'WAITING'
        ? (await this.prisma.reservation.count({
            where: {
              bookId: r.bookId,
              status: 'WAITING',
              OR: [
                { createdAt: { lt: r.createdAt } },
                { createdAt: r.createdAt, id: { lt: r.id } },
              ],
            },
          })) + 1
        : null;
    return {
      id: r.id,
      bookId: r.bookId,
      title: r.book.title,
      memberId: r.memberId,
      memberName: r.member.user.name,
      memberNumber: r.member.memberNumber,
      status: r.status,
      position,
      createdAt: r.createdAt.toISOString(),
      readyAt: r.readyAt?.toISOString() ?? null,
      expiresAt: r.expiresAt?.toISOString() ?? null,
    };
  }

  /**
   * Geeft beschikbare exemplaren van een boek aan de wachtenden (eerste in de rij eerst).
   * Moet binnen een transactie draaien; neemt een rij-lock op het boek zodat de wachtrij per
   * boek serieel wordt verwerkt.
   */
  async fillQueue(
    tx: Tx,
    bookId: number,
    effects: QueueEffects = { notifications: [], bookIds: [] },
  ): Promise<QueueEffects> {
    await tx.$queryRaw`SELECT "id" FROM "Book" WHERE "id" = ${bookId} FOR UPDATE`;
    const s = await this.settings.getAll(tx);
    for (;;) {
      const next = await tx.reservation.findFirst({
        where: { bookId, status: 'WAITING' },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: { book: { select: { title: true } }, member: { select: { userId: true } } },
      });
      if (!next) break;
      const [copy] = await tx.$queryRaw<{ id: number }[]>`
        SELECT "id" FROM "Copy" WHERE "bookId" = ${bookId} AND "status" = 'AVAILABLE'
        ORDER BY "id" LIMIT 1 FOR UPDATE SKIP LOCKED`;
      if (!copy) break;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + s.reservationHoldDays * DAY);
      await tx.copy.update({ where: { id: copy.id }, data: { status: 'RESERVED_HOLD' } });
      await tx.reservation.update({
        where: { id: next.id },
        data: { status: 'READY', copyId: copy.id, readyAt: now, expiresAt },
      });
      effects.notifications.push(
        await this.notifications.create(tx, next.member.userId, 'RESERVATION_READY', {
          title: next.book.title,
          date: expiresAt,
        }),
      );
      effects.bookIds.push(bookId);
    }
    return effects;
  }

  async reserve(userId: number, bookId: number): Promise<ReservationDto> {
    const effects: QueueEffects = { notifications: [], bookIds: [bookId] };
    const id = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Book" WHERE "id" = ${bookId} FOR UPDATE`;
      const book = await tx.book.findUnique({ where: { id: bookId } });
      if (!book)
        throw new DomainError('Boek niet gevonden', 'BOOK_NOT_FOUND', HttpStatus.NOT_FOUND);
      const member = await tx.member.findUnique({ where: { userId } });
      if (!member)
        throw new DomainError(
          'Alleen leden kunnen reserveren',
          'NOT_A_MEMBER',
          HttpStatus.FORBIDDEN,
        );
      if (member.blocked)
        throw new DomainError('Je account is geblokkeerd', 'MEMBER_BLOCKED', HttpStatus.FORBIDDEN);
      if (member.membershipUntil < new Date())
        throw new DomainError(
          'Je lidmaatschap is verlopen',
          'MEMBERSHIP_EXPIRED',
          HttpStatus.FORBIDDEN,
        );
      const s = await this.settings.getAll(tx);

      if (
        await tx.reservation.findFirst({
          where: { bookId, memberId: member.id, status: { in: ['WAITING', 'READY'] } },
        })
      ) {
        throw new DomainError('Je hebt dit boek al gereserveerd', 'ALREADY_RESERVED');
      }
      if (
        await tx.loan.findFirst({
          where: { memberId: member.id, returnedAt: null, copy: { bookId } },
        })
      ) {
        throw new DomainError('Je hebt dit boek al geleend', 'ALREADY_BORROWED');
      }
      const active = await tx.reservation.count({
        where: { memberId: member.id, status: { in: ['WAITING', 'READY'] } },
      });
      if (active >= s.maxReservationsPerMember) {
        throw new DomainError(
          `Je kunt maximaal ${s.maxReservationsPerMember} boeken tegelijk reserveren`,
          'RESERVATION_LIMIT',
          HttpStatus.FORBIDDEN,
        );
      }
      const available = await tx.copy.count({ where: { bookId, status: 'AVAILABLE' } });
      if (available > 0)
        throw new DomainError('Dit boek is beschikbaar: je kunt het direct lenen', 'AVAILABLE_NOW');
      const loanable = await tx.copy.count({
        where: { bookId, status: { notIn: ['LOST', 'DAMAGED'] } },
      });
      if (loanable === 0)
        throw new DomainError('Er zijn geen uitleenbare exemplaren van dit boek', 'NO_COPIES');

      const r = await tx.reservation.create({ data: { bookId, memberId: member.id } });
      await this.fillQueue(tx, bookId, effects);
      return r.id;
    });
    await this.audit.log('reservation.create', userId, { reservationId: id, bookId });
    await this.publish(effects);
    return this.get(id);
  }

  async get(id: number): Promise<ReservationDto> {
    const r = await this.prisma.reservation.findUniqueOrThrow({ where: { id }, include });
    return this.toDto(r);
  }

  async cancel(id: number, actor: { id: number; isStaff: boolean }): Promise<ReservationDto> {
    const effects: QueueEffects = { notifications: [], bookIds: [] };
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.reservation.findUnique({ where: { id }, include: { member: true } });
      if (!r || (!actor.isStaff && r.member.userId !== actor.id)) {
        throw new DomainError(
          'Reservering niet gevonden',
          'RESERVATION_NOT_FOUND',
          HttpStatus.NOT_FOUND,
        );
      }
      await tx.$queryRaw`SELECT "id" FROM "Book" WHERE "id" = ${r.bookId} FOR UPDATE`;
      const fresh = await tx.reservation.findUniqueOrThrow({ where: { id } });
      if (fresh.status !== 'WAITING' && fresh.status !== 'READY') {
        throw new DomainError('Deze reservering is al afgesloten', 'RESERVATION_CLOSED');
      }
      await tx.reservation.update({
        where: { id },
        data: { status: 'CANCELLED', closedAt: new Date() },
      });
      await this.releaseCopy(tx, fresh.copyId, fresh.status === 'READY');
      effects.bookIds.push(r.bookId);
      await this.fillQueue(tx, r.bookId, effects);
    });
    await this.audit.log('reservation.cancel', actor.id, { reservationId: id });
    await this.publish(effects);
    return this.get(id);
  }

  /** Zet een vastgehouden exemplaar terug op AVAILABLE (alleen als het nog echt vastgehouden wordt). */
  private async releaseCopy(tx: Tx, copyId: number | null, wasReady: boolean) {
    if (!wasReady || !copyId) return;
    await tx.copy.updateMany({
      where: { id: copyId, status: 'RESERVED_HOLD' },
      data: { status: 'AVAILABLE' },
    });
  }

  /** Reserveringen waarvan de ophaaltermijn voorbij is: vervallen en doorschuiven naar de volgende. */
  async expireOverdue(now = new Date()): Promise<number> {
    const due = await this.prisma.reservation.findMany({
      where: { status: 'READY', expiresAt: { lt: now } },
      select: { id: true },
    });
    let expired = 0;
    for (const { id } of due) {
      const effects: QueueEffects = { notifications: [], bookIds: [] };
      const done = await this.prisma.$transaction(async (tx) => {
        const r = await tx.reservation.findUnique({
          where: { id },
          include: { book: { select: { title: true } }, member: true },
        });
        if (!r) return false;
        await tx.$queryRaw`SELECT "id" FROM "Book" WHERE "id" = ${r.bookId} FOR UPDATE`;
        const fresh = await tx.reservation.findUniqueOrThrow({ where: { id } });
        if (fresh.status !== 'READY') return false;
        await tx.reservation.update({ where: { id }, data: { status: 'EXPIRED', closedAt: now } });
        await this.releaseCopy(tx, fresh.copyId, true);
        effects.notifications.push(
          await this.notifications.create(tx, r.member.userId, 'RESERVATION_EXPIRED', {
            title: r.book.title,
          }),
        );
        effects.bookIds.push(r.bookId);
        await this.fillQueue(tx, r.bookId, effects);
        return true;
      });
      if (done) {
        expired++;
        await this.publish(effects);
      }
    }
    return expired;
  }

  /**
   * Een lid leent een boek dat hij/zij had gereserveerd: sluit de reservering.
   * Een eventueel vastgehouden ander exemplaar wordt weer vrijgegeven.
   */
  async fulfillOnCheckout(
    tx: Tx,
    memberId: number,
    bookId: number,
    usedCopyId: number,
    effects: QueueEffects,
  ) {
    const r = await tx.reservation.findFirst({
      where: { memberId, bookId, status: { in: ['WAITING', 'READY'] } },
    });
    if (!r) return;
    await tx.reservation.update({
      where: { id: r.id },
      data: { status: 'FULFILLED', closedAt: new Date() },
    });
    if (r.status === 'READY' && r.copyId && r.copyId !== usedCopyId) {
      await this.releaseCopy(tx, r.copyId, true);
      await this.fillQueue(tx, bookId, effects);
    }
  }

  /** Is er iemand die op dit boek wacht? (blokkeert verlengen) */
  async hasWaiting(bookId: number, tx: Tx | PrismaService = this.prisma): Promise<boolean> {
    return (await tx.reservation.count({ where: { bookId, status: 'WAITING' } })) > 0;
  }

  async forMember(userId: number, activeOnly = true): Promise<ReservationDto[]> {
    const rows = await this.prisma.reservation.findMany({
      where: {
        member: { userId },
        ...(activeOnly ? { status: { in: ['WAITING', 'READY'] } } : {}),
      },
      include,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return Promise.all(rows.map((r) => this.toDto(r)));
  }

  async listActive(): Promise<ReservationDto[]> {
    const rows = await this.prisma.reservation.findMany({
      where: { status: { in: ['WAITING', 'READY'] } },
      include,
      orderBy: [{ bookId: 'asc' }, { createdAt: 'asc' }],
      take: 300,
    });
    return Promise.all(rows.map((r) => this.toDto(r)));
  }

  async waitingCount(bookId: number): Promise<number> {
    return this.prisma.reservation.count({ where: { bookId, status: 'WAITING' } });
  }
}
