import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuthorDto {
  @ApiProperty() id: number;
  @ApiProperty() name: string;
}

export class BookDto {
  @ApiProperty() id: number;
  @ApiProperty() title: string;
  @ApiPropertyOptional({ nullable: true, type: String }) isbn: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) description: string | null;
  @ApiProperty() language: string;
  @ApiPropertyOptional({ nullable: true, type: Number }) publishedYear: number | null;
  @ApiPropertyOptional({ nullable: true, type: String }) genre: string | null;
  @ApiProperty({ type: [AuthorDto] }) authors: AuthorDto[];
  @ApiProperty({ description: 'Totaal aantal exemplaren' }) copiesTotal: number;
  @ApiProperty({ description: 'Beschikbare exemplaren (afgeleid)' }) copiesAvailable: number;
}
