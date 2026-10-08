import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { Public } from '../auth/decorators';
import type { AuthedRequest } from '../auth/auth.guard';
import { BookDetailDto, BookPageDto, FiltersDto, SearchQueryDto } from './dto';
import { BooksService } from './books.service';
import { StorageService } from './storage.service';

@Public()
@ApiTags('catalog')
@Controller()
export class BooksController {
  constructor(
    private readonly books: BooksService,
    private readonly storage: StorageService,
  ) {}

  @Get('books')
  @ApiOkResponse({ type: BookPageDto })
  list(@Query() query: SearchQueryDto) {
    return this.books.list(query);
  }

  @Get('catalog/filters')
  @ApiOkResponse({ type: FiltersDto })
  filters() {
    return this.books.filters();
  }

  @Get('books/:id')
  @ApiOkResponse({ type: BookDetailDto })
  @ApiNotFoundResponse()
  get(@Param('id', ParseIntPipe) id: number, @Req() req: AuthedRequest) {
    const isStaff = req.user?.role === 'LIBRARIAN' || req.user?.role === 'ADMIN';
    return this.books.detail(id, isStaff);
  }

  @Get('covers/:key')
  @ApiProduces('image/jpeg', 'image/png', 'image/webp')
  @Header('Cache-Control', 'public, max-age=86400')
  async cover(@Param('key') key: string, @Res() res: FastifyReply) {
    if (!/^[\w.-]+$/.test(key) || key.endsWith('.type')) throw new NotFoundException();
    const obj = await this.storage.get(key);
    if (!obj) throw new NotFoundException();
    void res
      .header('Content-Type', obj.contentType)
      .header('X-Content-Type-Options', 'nosniff')
      .send(obj.body);
  }
}
