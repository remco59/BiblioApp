import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  BookDetailDto,
  BookDto,
  BookInputDto,
  BookPageDto,
  FiltersDto,
  SearchQueryDto,
} from './dto';
import { normalizeIsbn } from './isbn.service';
import { SearchService } from './search.service';

export const bookInclude = {
  genre: true,
  series: true,
  tags: { include: { tag: true } },
  authors: { include: { author: true } },
  copies: { select: { id: true, barcode: true, status: true }, orderBy: { id: 'asc' } },
} satisfies Prisma.BookInclude;

type BookRow = Prisma.BookGetPayload<{ include: typeof bookInclude }>;

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
  };
}

const clean = (names?: string[]) => [
  ...new Set((names ?? []).map((n) => n.trim()).filter(Boolean)),
];

@Injectable()
export class BooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly searchService: SearchService,
  ) {}

  async list(query: SearchQueryDto): Promise<BookPageDto> {
    const { ids, total, page, pageSize, suggestion } = await this.searchService.search(query);
    const rows = await this.prisma.book.findMany({
      where: { id: { in: ids } },
      include: bookInclude,
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const items = ids
      .map((id) => byId.get(id))
      .filter((r): r is BookRow => !!r)
      .map(toBookDto);
    return { items, total, page, pageSize, suggestion };
  }

  async filters(): Promise<FiltersDto> {
    const [genres, tags, langs, years] = await Promise.all([
      this.prisma.genre.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.tag.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.book.findMany({
        distinct: ['language'],
        select: { language: true },
        orderBy: { language: 'asc' },
      }),
      this.prisma.book.aggregate({ _min: { publishedYear: true }, _max: { publishedYear: true } }),
    ]);
    return {
      genres: genres.map((g) => g.name),
      tags: tags.map((t) => t.name),
      languages: langs.map((l) => l.language),
      minYear: years._min.publishedYear,
      maxYear: years._max.publishedYear,
    };
  }

  async detail(id: number, isStaff: boolean): Promise<BookDetailDto> {
    const row = await this.prisma.book.findUnique({ where: { id }, include: bookInclude });
    if (!row) throw new NotFoundException('Boek niet gevonden');
    const authorIds = row.authors.map((a) => a.authorId);
    const similar = await this.prisma.book.findMany({
      where: {
        id: { not: id },
        OR: [
          ...(authorIds.length ? [{ authors: { some: { authorId: { in: authorIds } } } }] : []),
          ...(row.genreId ? [{ genreId: row.genreId }] : []),
          ...(row.seriesId ? [{ seriesId: row.seriesId }] : []),
        ],
      },
      include: bookInclude,
      orderBy: { title: 'asc' },
      take: 4,
    });
    return {
      ...toBookDto(row),
      copies: row.copies.map((c) => ({
        id: c.id,
        status: c.status,
        barcode: isStaff ? c.barcode : null,
      })),
      similar: similar.map(toBookDto),
    };
  }

  /** Zet namen om naar relaties (aanmaken indien nodig). */
  private async relations(tx: Prisma.TransactionClient, dto: BookInputDto) {
    const genre = dto.genre?.trim()
      ? await tx.genre.upsert({
          where: { name: dto.genre.trim() },
          update: {},
          create: { name: dto.genre.trim() },
        })
      : null;
    const series = dto.series?.trim()
      ? await tx.series.upsert({
          where: { name: dto.series.trim() },
          update: {},
          create: { name: dto.series.trim() },
        })
      : null;
    const authors = [];
    for (const name of clean(dto.authors)) {
      authors.push(
        (await tx.author.findFirst({ where: { name } })) ??
          (await tx.author.create({ data: { name } })),
      );
    }
    const tags = [];
    for (const name of clean(dto.tags)) {
      tags.push(await tx.tag.upsert({ where: { name }, update: {}, create: { name } }));
    }
    return { genre, series, authors, tags };
  }

  async create(dto: BookInputDto): Promise<BookDetailDto> {
    const isbn = dto.isbn ? normalizeIsbn(dto.isbn) : null;
    if (isbn && (await this.prisma.book.findUnique({ where: { isbn } }))) {
      throw new ConflictException('Er bestaat al een boek met dit ISBN');
    }
    const id = await this.prisma.$transaction(async (tx) => {
      const rel = await this.relations(tx, dto);
      const book = await tx.book.create({
        data: {
          title: dto.title.trim(),
          isbn,
          description: dto.description ?? null,
          language: dto.language ?? 'nl',
          publishedYear: dto.publishedYear ?? null,
          coverUrl: dto.coverUrl ?? null,
          genreId: rel.genre?.id ?? null,
          seriesId: rel.series?.id ?? null,
          seriesNumber: dto.seriesNumber ?? null,
          authors: { create: rel.authors.map((a) => ({ authorId: a.id })) },
          tags: { create: rel.tags.map((t) => ({ tagId: t.id })) },
        },
      });
      return book.id;
    });
    return this.detail(id, true);
  }

  async update(id: number, dto: BookInputDto): Promise<BookDetailDto> {
    const isbn = dto.isbn ? normalizeIsbn(dto.isbn) : null;
    if (isbn) {
      const other = await this.prisma.book.findUnique({ where: { isbn } });
      if (other && other.id !== id)
        throw new ConflictException('Er bestaat al een boek met dit ISBN');
    }
    await this.prisma.$transaction(async (tx) => {
      const exists = await tx.book.findUnique({ where: { id } });
      if (!exists) throw new NotFoundException('Boek niet gevonden');
      const rel = await this.relations(tx, dto);
      await tx.bookAuthor.deleteMany({ where: { bookId: id } });
      await tx.bookTag.deleteMany({ where: { bookId: id } });
      await tx.book.update({
        where: { id },
        data: {
          title: dto.title.trim(),
          isbn,
          description: dto.description ?? null,
          language: dto.language ?? exists.language,
          publishedYear: dto.publishedYear ?? null,
          coverUrl: dto.coverUrl ?? (exists.coverKey ? exists.coverUrl : null),
          genreId: rel.genre?.id ?? null,
          seriesId: rel.series?.id ?? null,
          seriesNumber: dto.seriesNumber ?? null,
          authors: { create: rel.authors.map((a) => ({ authorId: a.id })) },
          tags: { create: rel.tags.map((t) => ({ tagId: t.id })) },
        },
      });
    });
    return this.detail(id, true);
  }

  async remove(id: number) {
    try {
      await this.prisma.book.delete({ where: { id } });
    } catch {
      throw new NotFoundException('Boek niet gevonden');
    }
  }

  async addCopy(bookId: number, barcode?: string) {
    const book = await this.prisma.book.findUnique({ where: { id: bookId } });
    if (!book) throw new NotFoundException('Boek niet gevonden');
    if (barcode) {
      try {
        return await this.prisma.copy.create({ data: { bookId, barcode } });
      } catch (e) {
        if ((e as { code?: string }).code === 'P2002')
          throw new ConflictException('Barcode bestaat al');
        throw e;
      }
    }
    // Automatische barcode: BB + boek-id + volgnummer; bij botsing volgend nummer proberen.
    let seq = (await this.prisma.copy.count({ where: { bookId } })) + 1;
    for (;;) {
      const code = `BB${String(bookId).padStart(4, '0')}${String(seq).padStart(2, '0')}`;
      try {
        return await this.prisma.copy.create({ data: { bookId, barcode: code } });
      } catch (e) {
        if ((e as { code?: string }).code !== 'P2002') throw e;
        seq++;
      }
    }
  }
}
