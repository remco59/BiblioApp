import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { bookInclude, BookRow, toBookDto } from '../catalog/book-mapper';
import { BookDto } from '../catalog/dto';
import { PrismaService } from '../prisma/prisma.service';

export interface Profile {
  authors: Map<number, number>;
  genres: Map<number, number>;
  tags: Map<number, number>;
  series: Set<number>;
}

const approvedAverage = (b: BookRow) =>
  b.reviews.length ? b.reviews.reduce((s, r) => s + r.rating, 0) / b.reviews.length : 0;

/** Score van een kandidaat t.o.v. een profiel (gewogen overeenkomst in auteur, reeks, genre en trefwoorden). */
export function score(candidate: BookRow, p: Profile): number {
  let s = 0;
  for (const a of candidate.authors) s += 3 * (p.authors.get(a.authorId) ?? 0);
  if (candidate.seriesId && p.series.has(candidate.seriesId)) s += 3;
  if (candidate.genreId) s += 2 * (p.genres.get(candidate.genreId) ?? 0);
  for (const t of candidate.tags) s += 1 * (p.tags.get(t.tagId) ?? 0);
  return s;
}

export function profileOf(books: BookRow[]): Profile {
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

@Injectable()
export class RecommendationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Vergelijkbare boeken: gelijke auteur/reeks/genre/trefwoorden, beter beoordeelde eerst bij gelijke score. */
  async similarTo(bookId: number, limit = 4): Promise<BookDto[]> {
    const base = await this.prisma.book.findUnique({ where: { id: bookId }, include: bookInclude });
    if (!base) return [];
    const profile = profileOf([base]);
    const or: Prisma.BookWhereInput[] = [
      ...(base.authors.length
        ? [{ authors: { some: { authorId: { in: base.authors.map((a) => a.authorId) } } } }]
        : []),
      ...(base.genreId ? [{ genreId: base.genreId }] : []),
      ...(base.seriesId ? [{ seriesId: base.seriesId }] : []),
      ...(base.tags.length
        ? [{ tags: { some: { tagId: { in: base.tags.map((t) => t.tagId) } } } }]
        : []),
    ];
    if (or.length === 0) return [];
    const candidates = await this.prisma.book.findMany({
      where: { id: { not: bookId }, OR: or },
      include: bookInclude,
      take: 100,
    });
    return candidates
      .map((c) => ({ c, s: score(c, profile) }))
      .sort(
        (a, b) =>
          b.s - a.s ||
          approvedAverage(b.c) - approvedAverage(a.c) ||
          a.c.title.localeCompare(b.c.title),
      )
      .slice(0, limit)
      .map((x) => toBookDto(x.c));
  }

  /** Persoonlijke aanbevelingen op basis van geleende en verlangde boeken; reeds geleende boeken vallen af. */
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
    const known = [...new Set([...borrowed, ...wishes.map((w) => w.bookId)])]; // al gelezen of al verlangd
    const pool = await this.prisma.book.findMany({
      where: { id: { notIn: known } },
      include: bookInclude,
      take: 500,
    });
    if (seedIds.length === 0) {
      // Nog geen geschiedenis: de best beoordeelde en populairste boeken
      return pool
        .sort(
          (a, b) =>
            approvedAverage(b) - approvedAverage(a) ||
            b.reviews.length - a.reviews.length ||
            a.title.localeCompare(b.title),
        )
        .slice(0, limit)
        .map(toBookDto);
    }
    const seeds = await this.prisma.book.findMany({
      where: { id: { in: seedIds } },
      include: bookInclude,
    });
    const profile = profileOf(seeds);
    return pool
      .map((c) => ({ c, s: score(c, profile) }))
      .filter((x) => x.s > 0)
      .sort(
        (a, b) =>
          b.s - a.s ||
          approvedAverage(b.c) - approvedAverage(a.c) ||
          a.c.title.localeCompare(b.c.title),
      )
      .slice(0, limit)
      .map((x) => toBookDto(x.c));
  }
}
