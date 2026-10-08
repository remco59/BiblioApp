import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { bookInclude } from './book-mapper';
import { BooksService } from './books.service';
import { parseCsv, toCsv } from './csv';
import { ImportResultDto } from './dto';
import { isValidIsbn, normalizeIsbn } from './isbn.service';

export const CSV_HEADER = [
  'isbn',
  'title',
  'authors',
  'genre',
  'language',
  'year',
  'tags',
  'series',
  'seriesNumber',
  'description',
  'copies',
] as const;

const list = (s?: string) =>
  (s ?? '')
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean);

@Injectable()
export class ImportExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly books: BooksService,
  ) {}

  async export(): Promise<string> {
    const rows = await this.prisma.book.findMany({ include: bookInclude, orderBy: { id: 'asc' } });
    return toCsv([
      [...CSV_HEADER],
      ...rows.map((b) => [
        b.isbn,
        b.title,
        b.authors.map((a) => a.author.name).join('; '),
        b.genre?.name,
        b.language,
        b.publishedYear,
        b.tags.map((t) => t.tag.name).join('; '),
        b.series?.name,
        b.seriesNumber,
        b.description,
        b.copies.length,
      ]),
    ]);
  }

  /** Importeert per rij; bestaand boek (zelfde ISBN) wordt bijgewerkt. Fouten per rij worden gemeld. */
  async import(csv: string): Promise<ImportResultDto> {
    const [header, ...rows] = parseCsv(csv, true);
    const result: ImportResultDto = { created: 0, updated: 0, errors: [] };
    if (!header) {
      result.errors.push('Leeg bestand');
      return result;
    }
    const col = new Map(header.map((h, i) => [h.trim(), i]));
    if (!col.has('title')) {
      result.errors.push('Kolom "title" ontbreekt');
      return result;
    }
    for (const [i, r] of rows.entries()) {
      const line = i + 2;
      if (r.every((f) => f.trim() === '')) continue;
      const get = (k: string) => (col.has(k) ? r[col.get(k)!]?.trim() || undefined : undefined);
      try {
        const title = get('title');
        if (!title) throw new Error('titel ontbreekt');
        const rawIsbn = get('isbn');
        const isbn = rawIsbn ? normalizeIsbn(rawIsbn) : undefined;
        if (isbn && !isValidIsbn(isbn)) throw new Error(`ongeldig ISBN ${rawIsbn}`);
        const year = get('year') ? Number(get('year')) : undefined;
        if (year !== undefined && !Number.isInteger(year)) throw new Error('jaar is geen getal');
        const input = {
          title,
          isbn,
          genre: get('genre'),
          language: get('language'),
          publishedYear: year,
          authors: list(get('authors')),
          tags: list(get('tags')),
          series: get('series'),
          seriesNumber: get('seriesNumber') ? Number(get('seriesNumber')) : undefined,
          description: get('description'),
        };
        const existing = isbn ? await this.prisma.book.findUnique({ where: { isbn } }) : null;
        const book = existing
          ? await this.books.update(existing.id, input)
          : await this.books.create(input);
        if (existing) result.updated++;
        else result.created++;
        const wanted = Number(get('copies') ?? 0);
        for (let n = book.copiesTotal; n < wanted; n++) await this.books.addCopy(book.id);
      } catch (e) {
        result.errors.push(`Regel ${line}: ${(e as Error).message}`);
      }
    }
    return result;
  }
}
