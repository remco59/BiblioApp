import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BookDto } from './book.dto';

const include = {
  genre: true,
  authors: { include: { author: true } },
  copies: { select: { status: true } },
} satisfies Prisma.BookInclude;

type BookRow = Prisma.BookGetPayload<{ include: typeof include }>;

export function toBookDto(b: BookRow): BookDto {
  return {
    id: b.id,
    title: b.title,
    isbn: b.isbn,
    description: b.description,
    language: b.language,
    publishedYear: b.publishedYear,
    genre: b.genre?.name ?? null,
    authors: b.authors.map((a) => ({ id: a.author.id, name: a.author.name })),
    copiesTotal: b.copies.length,
    copiesAvailable: b.copies.filter((c) => c.status === 'AVAILABLE').length,
  };
}

@Injectable()
export class BooksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<BookDto[]> {
    const rows = await this.prisma.book.findMany({ include, orderBy: { title: 'asc' } });
    return rows.map(toBookDto);
  }

  async get(id: number): Promise<BookDto> {
    const row = await this.prisma.book.findUnique({ where: { id }, include });
    if (!row) throw new NotFoundException('Boek niet gevonden');
    return toBookDto(row);
  }
}
