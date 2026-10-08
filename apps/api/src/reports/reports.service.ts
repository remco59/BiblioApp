import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toCsv } from '../catalog/csv';
import { PrismaService } from '../prisma/prisma.service';

const DAY = 24 * 3600 * 1000;
export type Interval = 'day' | 'month';

export interface Range {
  from: Date;
  to: Date;
}

/** Leest ?from en ?to (ISO-datum); standaard de laatste 30 dagen. `to` is inclusief (hele dag). */
export function parseRange(from?: string, to?: string, now = new Date()): Range {
  const end = to
    ? new Date(`${to}T00:00:00.000Z`)
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = from ? new Date(`${from}T00:00:00.000Z`) : new Date(end.getTime() - 29 * DAY);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
    throw new BadRequestException('Ongeldige datum (gebruik JJJJ-MM-DD)');
  if (start > end) throw new BadRequestException('"from" ligt na "to"');
  if (end.getTime() - start.getTime() > 3 * 366 * DAY)
    throw new BadRequestException('Periode is te lang (maximaal 3 jaar)');
  return { from: start, to: new Date(end.getTime() + DAY) }; // [from, to)
}

const bucket = (d: Date, interval: Interval) =>
  d.toISOString().slice(0, interval === 'day' ? 10 : 7);

/** Alle buckets tussen from en to (ook lege), zodat grafieken geen gaten hebben. */
export function buckets({ from, to }: Range, interval: Interval): string[] {
  const out: string[] = [];
  const d = new Date(from);
  if (interval === 'month') d.setUTCDate(1);
  while (d < to) {
    out.push(bucket(d, interval));
    if (interval === 'day') d.setUTCDate(d.getUTCDate() + 1);
    else d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

export interface PopularRow {
  bookId: number;
  title: string;
  authors: string;
  loans: number;
}
export interface VolumeRow {
  period: string;
  loans: number;
  returns: number;
}
export interface OverdueRow {
  loanId: number;
  title: string;
  memberNumber: string;
  memberName: string;
  dueAt: string;
  daysLate: number;
  fineCents: number;
}
export interface FinesReport {
  issuedCents: number;
  collectedCents: number;
  waivedCents: number;
  outstandingCents: number;
  byPeriod: { period: string; issuedCents: number; collectedCents: number }[];
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async popular(range: Range, limit = 10): Promise<PopularRow[]> {
    const rows = await this.prisma.$queryRaw<
      { bookId: number; title: string; authors: string | null; loans: bigint }[]
    >`
      SELECT b."id" AS "bookId", b."title",
             (SELECT string_agg(a."name", '; ' ORDER BY a."name") FROM "BookAuthor" ba JOIN "Author" a ON a."id" = ba."authorId" WHERE ba."bookId" = b."id") AS "authors",
             count(l."id") AS "loans"
      FROM "Loan" l JOIN "Copy" c ON c."id" = l."copyId" JOIN "Book" b ON b."id" = c."bookId"
      WHERE l."loanedAt" >= ${range.from} AND l."loanedAt" < ${range.to}
      GROUP BY b."id", b."title"
      ORDER BY count(l."id") DESC, b."title" ASC
      LIMIT ${limit}`;
    return rows.map((r) => ({
      bookId: r.bookId,
      title: r.title,
      authors: r.authors ?? '',
      loans: Number(r.loans),
    }));
  }

  async volume(range: Range, interval: Interval = 'day'): Promise<VolumeRow[]> {
    const trunc = Prisma.raw(`'${interval}'`);
    const [loans, returns] = await Promise.all([
      this.prisma.$queryRaw<{ p: Date; n: bigint }[]>`
        SELECT date_trunc(${trunc}, "loanedAt" AT TIME ZONE 'UTC') AS p, count(*) AS n FROM "Loan"
        WHERE "loanedAt" >= ${range.from} AND "loanedAt" < ${range.to} GROUP BY 1`,
      this.prisma.$queryRaw<{ p: Date; n: bigint }[]>`
        SELECT date_trunc(${trunc}, "returnedAt" AT TIME ZONE 'UTC') AS p, count(*) AS n FROM "Loan"
        WHERE "returnedAt" >= ${range.from} AND "returnedAt" < ${range.to} GROUP BY 1`,
    ]);
    const l = new Map(
      loans.map((r) => [
        bucket(new Date(r.p.toISOString().replace(/Z?$/, 'Z')), interval),
        Number(r.n),
      ]),
    );
    const r = new Map(
      returns.map((x) => [
        bucket(new Date(x.p.toISOString().replace(/Z?$/, 'Z')), interval),
        Number(x.n),
      ]),
    );
    return buckets(range, interval).map((period) => ({
      period,
      loans: l.get(period) ?? 0,
      returns: r.get(period) ?? 0,
    }));
  }

  async overdue(now = new Date()): Promise<OverdueRow[]> {
    const loans = await this.prisma.loan.findMany({
      where: { returnedAt: null, dueAt: { lt: now } },
      include: {
        copy: { include: { book: { select: { title: true } } } },
        member: { include: { user: { select: { name: true } } } },
        fines: { where: { reason: 'OVERDUE' } },
      },
      orderBy: { dueAt: 'asc' },
    });
    return loans.map((l) => ({
      loanId: l.id,
      title: l.copy.book.title,
      memberNumber: l.member.memberNumber,
      memberName: l.member.user.name,
      dueAt: l.dueAt.toISOString(),
      daysLate: Math.ceil((now.getTime() - l.dueAt.getTime()) / DAY),
      fineCents: l.fines.reduce((s, f) => s + f.amountCents, 0),
    }));
  }

  /** Boete-inkomsten: uitgeschreven, ontvangen (betalingen), kwijtgescholden en nog openstaand. */
  async fines(range: Range, interval: Interval = 'month'): Promise<FinesReport> {
    const [issued, payments, waived, open] = await Promise.all([
      this.prisma.fine.findMany({
        where: { createdAt: { gte: range.from, lt: range.to } },
        select: { createdAt: true, amountCents: true },
      }),
      this.prisma.payment.findMany({
        where: { paidAt: { gte: range.from, lt: range.to } },
        select: { paidAt: true, amountCents: true },
      }),
      this.prisma.fine.findMany({
        where: { waivedAt: { gte: range.from, lt: range.to } },
        select: { amountCents: true, payments: { select: { amountCents: true } } },
      }),
      this.prisma.fine.findMany({
        where: { waivedAt: null },
        select: { amountCents: true, payments: { select: { amountCents: true } } },
      }),
    ]);
    const sum = (xs: { amountCents: number }[]) => xs.reduce((s, x) => s + x.amountCents, 0);
    const byPeriod = new Map(
      buckets(range, interval).map((p) => [p, { period: p, issuedCents: 0, collectedCents: 0 }]),
    );
    for (const f of issued) {
      const e = byPeriod.get(bucket(f.createdAt, interval));
      if (e) e.issuedCents += f.amountCents;
    }
    for (const p of payments) {
      const e = byPeriod.get(bucket(p.paidAt, interval));
      if (e) e.collectedCents += p.amountCents;
    }
    return {
      issuedCents: sum(issued),
      collectedCents: sum(payments),
      waivedCents: waived.reduce((s, f) => s + Math.max(0, f.amountCents - sum(f.payments)), 0),
      outstandingCents: open.reduce((s, f) => s + Math.max(0, f.amountCents - sum(f.payments)), 0),
      byPeriod: [...byPeriod.values()],
    };
  }

  // ---- CSV ----
  popularCsv = (rows: PopularRow[]) =>
    toCsv([
      ['boek_id', 'titel', 'auteurs', 'uitleningen'],
      ...rows.map((r) => [r.bookId, r.title, r.authors, r.loans]),
    ]);
  volumeCsv = (rows: VolumeRow[]) =>
    toCsv([
      ['periode', 'uitleningen', 'inleveringen'],
      ...rows.map((r) => [r.period, r.loans, r.returns]),
    ]);
  overdueCsv = (rows: OverdueRow[]) =>
    toCsv([
      ['uitleen_id', 'titel', 'lidnummer', 'lid', 'uiterste_datum', 'dagen_te_laat', 'boete_eur'],
      ...rows.map((r) => [
        r.loanId,
        r.title,
        r.memberNumber,
        r.memberName,
        r.dueAt.slice(0, 10),
        r.daysLate,
        (r.fineCents / 100).toFixed(2),
      ]),
    ]);
  finesCsv = (r: FinesReport) =>
    toCsv([
      ['periode', 'uitgeschreven_eur', 'ontvangen_eur'],
      ...r.byPeriod.map((p) => [
        p.period,
        (p.issuedCents / 100).toFixed(2),
        (p.collectedCents / 100).toFixed(2),
      ]),
      ['totaal', (r.issuedCents / 100).toFixed(2), (r.collectedCents / 100).toFixed(2)],
      ['kwijtgescholden', (r.waivedCents / 100).toFixed(2), ''],
      ['openstaand', (r.outstandingCents / 100).toFixed(2), ''],
    ]);
}
