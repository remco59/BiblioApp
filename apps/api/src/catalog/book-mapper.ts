import { Prisma } from '@prisma/client';
import { BookDto } from './dto';

export const bookInclude = {
  genre: true,
  series: true,
  tags: { include: { tag: true } },
  authors: { include: { author: true } },
  copies: { select: { id: true, barcode: true, status: true }, orderBy: { id: 'asc' } },
  reviews: { where: { status: 'APPROVED' }, select: { rating: true } },
} satisfies Prisma.BookInclude;

export type BookRow = Prisma.BookGetPayload<{ include: typeof bookInclude }>;

export function toBookDto(b: BookRow): BookDto {
  return {
    id: b.id,
    title: b.title,
    isbn: b.isbn,
    description: b.description,
    language: b.language,
    publishedYear: b.publishedYear,
    genre: b.genre?.name ?? null,
    coverUrl: b.coverKey ? `/api/covers/${b.coverKey}` : b.coverUrl,
    series: b.series?.name ?? null,
    seriesNumber: b.seriesNumber,
    tags: b.tags.map((t) => t.tag.name).sort(),
    authors: b.authors.map((a) => ({ id: a.author.id, name: a.author.name })),
    copiesTotal: b.copies.length,
    copiesAvailable: b.copies.filter((c) => c.status === 'AVAILABLE').length,
    ratingCount: b.reviews.length,
    ratingAverage: b.reviews.length
      ? Math.round((b.reviews.reduce((sum, r) => sum + r.rating, 0) / b.reviews.length) * 10) / 10
      : null,
  };
}
