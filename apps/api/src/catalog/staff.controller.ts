import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import { randomBytes } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { Roles } from '../auth/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { BooksService } from './books.service';
import {
  BookDetailDto,
  BookInputDto,
  CopyDto,
  CopyInputDto,
  CopyUpdateDto,
  ImportResultDto,
  IsbnMetadataDto,
  NamedDto,
  NameDto,
} from './dto';
import { ImportExportService } from './import-export.service';
import { IsbnService } from './isbn.service';
import { StorageService } from './storage.service';

const COVER_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const KINDS = ['authors', 'genres', 'tags', 'series'] as const;
type Kind = (typeof KINDS)[number];

/** Beheer van de collectie; alleen voor bibliothecarissen en beheerders. */
@ApiTags('staff-catalog')
@Roles('LIBRARIAN', 'ADMIN')
@Controller('staff')
export class StaffCatalogController {
  constructor(
    private readonly books: BooksService,
    private readonly prisma: PrismaService,
    private readonly isbn: IsbnService,
    private readonly storage: StorageService,
    private readonly importExport: ImportExportService,
  ) {}

  @Post('books')
  @ApiOkResponse({ type: BookDetailDto })
  create(@Body() dto: BookInputDto) {
    return this.books.create(dto);
  }

  @Patch('books/:id')
  @ApiOkResponse({ type: BookDetailDto })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: BookInputDto) {
    return this.books.update(id, dto);
  }

  @Delete('books/:id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.books.remove(id);
  }

  @Post('books/:id/copies')
  @ApiOkResponse({ type: CopyDto })
  async addCopy(@Param('id', ParseIntPipe) id: number, @Body() dto: CopyInputDto) {
    return this.books.addCopy(id, dto.barcode);
  }

  @Patch('copies/:id')
  @ApiOkResponse({ type: CopyDto })
  async updateCopy(@Param('id', ParseIntPipe) id: number, @Body() dto: CopyUpdateDto) {
    return this.books.setCopyStatus(id, dto.status);
  }

  @Delete('copies/:id')
  @HttpCode(204)
  async removeCopy(@Param('id', ParseIntPipe) id: number) {
    await this.prisma.copy.delete({ where: { id } }).catch(() => {
      throw new NotFoundException('Exemplaar niet gevonden');
    });
  }

  @Post('books/:id/cover')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiOkResponse({ schema: { type: 'object', properties: { coverUrl: { type: 'string' } } } })
  async uploadCover(@Param('id', ParseIntPipe) id: number, @Req() req: FastifyRequest) {
    const book = await this.prisma.book.findUnique({ where: { id } });
    if (!book) throw new NotFoundException('Boek niet gevonden');
    const file = await (req as FastifyRequest & { file: () => Promise<any> }).file(); // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!file) throw new BadRequestException('Geen bestand ontvangen');
    const ext = COVER_TYPES[file.mimetype as string];
    if (!ext) throw new BadRequestException('Alleen JPEG, PNG of WebP toegestaan');
    const body: Buffer = await file.toBuffer(); // gooit bij overschrijding van de maximale grootte
    const key = `${id}-${randomBytes(6).toString('hex')}.${ext}`;
    await this.storage.put(key, body, file.mimetype);
    await this.prisma.book.update({ where: { id }, data: { coverKey: key } });
    return { coverUrl: `/api/covers/${key}` };
  }

  @Get('isbn/:isbn')
  @ApiOkResponse({ type: IsbnMetadataDto })
  lookup(@Param('isbn') isbn: string) {
    return this.isbn.lookup(isbn);
  }

  @Get('books.csv')
  @ApiProduces('text/csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="boeken.csv"')
  exportCsv() {
    return this.importExport.export();
  }

  @Post('books/import')
  @ApiConsumes('text/csv')
  @ApiBody({ schema: { type: 'string' } })
  @ApiOkResponse({ type: ImportResultDto })
  @HttpCode(200)
  importCsv(@Body() csv: unknown) {
    if (typeof csv !== 'string')
      throw new BadRequestException('Stuur CSV met Content-Type: text/csv');
    return this.importExport.import(csv);
  }

  // ---- auteurs, genres, tags, reeksen ----

  private delegate(kind: string): LookupDelegate {
    if (!(KINDS as readonly string[]).includes(kind)) throw new NotFoundException();
    // De vier tabellen delen dezelfde vorm (id + name + boeken-telling).
    const delegates = {
      authors: this.prisma.author,
      genres: this.prisma.genre,
      tags: this.prisma.tag,
      series: this.prisma.series,
    };
    return delegates[kind as Kind] as unknown as LookupDelegate;
  }

  @Get('lookups/:kind')
  @ApiOkResponse({ type: [NamedDto] })
  async listLookup(@Param('kind') kind: string) {
    const rows = await this.delegate(kind).findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { books: true } } },
    });
    return rows.map((r) => ({ id: r.id, name: r.name, books: r._count.books }));
  }

  @Post('lookups/:kind')
  @ApiOkResponse({ type: NamedDto })
  async createLookup(@Param('kind') kind: string, @Body() dto: NameDto) {
    const r = await this.delegate(kind).create({ data: { name: dto.name.trim() } });
    return { id: r.id, name: r.name, books: 0 };
  }

  @Patch('lookups/:kind/:id')
  @ApiOkResponse({ type: NamedDto })
  async renameLookup(
    @Param('kind') kind: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: NameDto,
  ) {
    const r = await this.delegate(kind)
      .update({ where: { id }, data: { name: dto.name.trim() } })
      .catch(() => {
        throw new NotFoundException();
      });
    return { id: r.id, name: r.name, books: 0 };
  }

  @Delete('lookups/:kind/:id')
  @HttpCode(204)
  async deleteLookup(@Param('kind') kind: string, @Param('id', ParseIntPipe) id: number) {
    await this.delegate(kind)
      .delete({ where: { id } })
      .catch(() => {
        throw new NotFoundException();
      });
  }
}

interface LookupRow {
  id: number;
  name: string;
}

interface LookupDelegate {
  findMany(args: {
    orderBy: { name: 'asc' };
    include: { _count: { select: { books: true } } };
  }): Promise<(LookupRow & { _count: { books: number } })[]>;
  create(args: { data: { name: string } }): Promise<LookupRow>;
  update(args: { where: { id: number }; data: { name: string } }): Promise<LookupRow>;
  delete(args: { where: { id: number } }): Promise<unknown>;
}
