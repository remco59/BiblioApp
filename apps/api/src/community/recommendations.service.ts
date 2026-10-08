import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { bookInclude, toBookDto } from '../catalog/book-mapper';
import { BookDto } from '../catalog/dto';
import { PrismaService } from '../prisma/prisma.service';

/** Alleen de velden die nodig zijn om te scoren; de volledige DTO wordt pas voor de uiteindelijke selectie geladen. */
const light = {
  id: true,
  title: true,
  genreId: true,
  seriesId: true,
  authors: { select: { authorId: true } },
  tags: { select: { tagId: true } },
  reviews: { where: { status: 'APPROVED' }, select: { rating: true } },
} satisfies Prisma.BookSelect;
export type Scorable = Prisma.BookGetPayload<{ select: typeof light }>;

export interface Profile {
  authors: Map<number, number>;
  genres: Map<number, number>;
  tags: Map<number, number>;
  series: Set<number>;
}

const approvedAverage = (b: Scorable) =>
  b.reviews.length ? b.reviews.reduce((s, r) => s + r.rating, 0) / b.reviews.length : 0;

/** Score van een kandidaat t.o.v. een profiel (gewogen overeenkomst in auteur, reeks, genre en trefwoorden). */
export function score(candidate: Scorable, p: Profile): number {
  let s = 0;
  for (const a of candidate.authors) s += 3 * (p.authors.get(a.authorId) ?? 0);
  if (candidate.seriesId && p.series.has(candidate.seriesId)) s += 3;
  if (candidate.genreId) s += 2 * (p.genres.get(candidate.genreId) ?? 0);
  for (const t of candidate.tags) s += 1 * (p.tags.get(t.tagId) ?? 0);
  return s;
}

export function profileOf(books: Scorable[]): Profile {
  const p: Profile = { authors: new Map(), genres: new Map(), tags: new Map(), series: new Set() };
  const bump = (m: Map<number, number>, k: number) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const b of books) {
    b.authors.forEach((a) => bump(p.authors, a.authorId));
    if (b.genreId) bump(p.genres, b.genreId);
    b.tags.forEach((t) => bump(p.tags, t.tagId));
    if (b.seriesId) p.series.add(b.seriesId);
  }
  return p;
}

const byScore = (a: { c: Scorable; s: number }, b: { c: Scorable; s: number }) =>
  b.s - a.s || approvedAverage(b.c) - approvedAverage(a.c) || a.c.title.localeCompare(b.c.title);

@Injectable()
export class RecommendationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Laadt de volledige boekgegevens voor de gekozen ids, in dezelfde volgorde. */
  private async hydrate(ids: number[]): Promise<BookDto[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.book.findMany({
      where: { id: { in: ids } },
      include: bookInclude,
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids
      .map((id) => byId.get(id))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map(toBookDto);
  }

  /** Vergelijkbare boeken: gelijke auteur/reeks/genre/trefwoorden, beter beoordeelde eerst bij gelijke score. */
  async similarTo(bookId: number, limit = 4): Promise<BookDto[]> {
    const base = await this.prisma.book.findUnique({ where: { id: bookId }, select: light });
    if (!base) return [];
    const profile = profileOf([base]);
    const strong: Prisma.BookWhereInput[] = [
      ...(base.authors.length
        ? [{ authors: { some: { authorId: { in: base.authors.map((a) => a.authorId) } } } }]
        : []),
      ...(base.seriesId ? [{ seriesId: base.seriesId }] : []),
      ...(base.tags.length
        ? [{ tags: { some: { tagId: { in: base.tags.map((t) => t.tagId) } } } }]
        : []),
    ];
    // Eerst de sterke kandidaten (zelfde auteur/reeks/tag), daarna aanvullen met hetzelfde genre
    const strongRows = strong.length
      ? await this.prisma.book.findMany({
          where: { id: { not: bookId }, OR: strong },
          select: light,
          take: 100,
        })
      : [];
    let pool = strongRows;
    if (pool.length < 40 && base.genreId) {
      const taken = [bookId, ...pool.map((p) => p.id)];
      pool = pool.concat(
        await this.prisma.book.findMany({
          where: { id: { notIn: taken }, genreId: base.genreId },
          select: light,
          take: 40,
        }),
      );
    }
    const top = pool
      .map((c) => ({ c, s: score(c, profile) }))
      .sort(byScore)
      .slice(0, limit);
    return this.hydrate(top.map((x) => x.c.id));
  }

  /** Persoonlijke aanbevelingen op basis van geleende boeken en verlanglijst; al gelezen of verlangde boeken vallen af. */
  async forUser(userId: number, limit = 8): Promise<BookDto[]> {
    const [loans, wishes] = await Promise.all([
      this.prisma.loan.findMany({
        where: { member: { userId } },
        select: { copy: { select: { bookId: true } } },
      }),
      this.prisma.wishlistItem.findMany({ where: { userId }, select: { bookId: true } }),
    ]);
    const borrowed = new Set(loans.map((l) => l.copy.bookId));
    const seedIds = [...new Set([...borrowed, ...wishes.map((w) => w.bookId)])];
    const known = seedIds; // al gelezen of al verlangd

    if (seedIds.length === 0) {
      // Nog geen geschiedenis: de best beoordeelde boeken
      const rated = await this.prisma.review.groupBy({
        by: ['bookId'],
        where: { status: 'APPROVED' },
        _avg: { rating: true },
        _count: true,
        orderBy: [{ _avg: { rating: 'desc' } }, { _count: { bookId: 'desc' } }],
        take: limit,
      });
      const ids = rated.map((r) => r.bookId);
      if (ids.length < limit) {
        const fill = await this.prisma.book.findMany({
          where: { id: { notIn: ids } },
          select: { id: true },
          orderBy: { createdAt: 'desc' },
          take: limit - ids.length,
        });
        ids.push(...fill.map((f) => f.id));
      }
      return this.hydrate(ids);
    }

    const seeds = await this.prisma.book.findMany({
      where: { id: { in: seedIds } },
      select: light,
    });
    const profile = profileOf(seeds);
    // Kandidaten: boeken die minstens één auteur, genre, reeks of tag met het profiel delen
    const or: Prisma.BookWhereInput[] = [
      ...(profile.authors.size
        ? [{ authors: { some: { authorId: { in: [...profile.authors.keys()] } } } }]
        : []),
      ...(profile.genres.size ? [{ genreId: { in: [...profile.genres.keys()] } }] : []),
      ...(profile.series.size ? [{ seriesId: { in: [...profile.series] } }] : []),
      ...(profile.tags.size
        ? [{ tags: { some: { tagId: { in: [...profile.tags.keys()] } } } }]
        : []),
    ];
    if (or.length === 0) return [];
    const pool = await this.prisma.book.findMany({
      where: { id: { notIn: known }, OR: or },
      select: light,
      take: 500,
    });
    const top = pool
      .map((c) => ({ c, s: score(c, profile) }))
      .filter((x) => x.s > 0)
      .sort(byScore)
      .slice(0, limit);
    return this.hydrate(top.map((x) => x.c.id));
  }
}
