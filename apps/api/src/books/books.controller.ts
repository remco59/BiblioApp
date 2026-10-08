import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { BookDto } from './book.dto';
import { BooksService } from './books.service';

@ApiTags('books')
@Controller('books')
export class BooksController {
  constructor(private readonly books: BooksService) {}

  @Get()
  @ApiOkResponse({ type: [BookDto] })
  list() {
    return this.books.list();
  }

  @Get(':id')
  @ApiOkResponse({ type: BookDto })
  @ApiNotFoundResponse()
  get(@Param('id', ParseIntPipe) id: number) {
    return this.books.get(id);
  }
}
