import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const toBool = ({ value }: { value: unknown }) =>
  value === 'true' || value === true
    ? true
    : value === 'false' || value === false
      ? false
      : undefined;

export const SORTS = ['relevance', 'title', 'year_desc', 'year_asc', 'newest'] as const;

export class AuthorDto {
  @ApiProperty({ type: Number }) id: number;
  @ApiProperty({ type: String }) name: string;
}

export class BookDto {
  @ApiProperty({ type: Number }) id: number;
  @ApiProperty({ type: String }) title: string;
  @ApiProperty({ type: String, nullable: true }) isbn: string | null;
  @ApiProperty({ type: String, nullable: true }) description: string | null;
  @ApiProperty({ type: String }) language: string;
  @ApiProperty({ type: Number, nullable: true }) publishedYear: number | null;
  @ApiProperty({ type: String, nullable: true }) genre: string | null;
  @ApiProperty({ type: String, nullable: true }) coverUrl: string | null;
  @ApiProperty({ type: String, nullable: true }) series: string | null;
  @ApiProperty({ type: Number, nullable: true }) seriesNumber: number | null;
  @ApiProperty({ type: [String] }) tags: string[];
  @ApiProperty({ type: [AuthorDto] }) authors: AuthorDto[];
  @ApiProperty({ type: Number, description: 'Totaal aantal exemplaren' }) copiesTotal: number;
  @ApiProperty({ type: Number, description: 'Beschikbare exemplaren (afgeleid)' })
  copiesAvailable: number;
}

export class CopyDto {
  @ApiProperty({ type: Number }) id: number;
  @ApiProperty({ type: String, nullable: true, description: 'Alleen zichtbaar voor medewerkers' })
  barcode: string | null;
  @ApiProperty({ enum: ['AVAILABLE', 'LOANED', 'RESERVED_HOLD', 'LOST', 'DAMAGED'] })
  status: string;
}

export class BookDetailDto extends BookDto {
  @ApiProperty({ type: [CopyDto] }) copies: CopyDto[];
  @ApiProperty({ type: [BookDto], description: 'Vergelijkbare boeken' }) similar: BookDto[];
}

export class BookPageDto {
  @ApiProperty({ type: [BookDto] }) items: BookDto[];
  @ApiProperty({ type: Number }) total: number;
  @ApiProperty({ type: Number }) page: number;
  @ApiProperty({ type: Number }) pageSize: number;
  @ApiProperty({ type: String, nullable: true, description: '“Bedoelde je…” bij 0 resultaten' })
  suggestion: string | null;
}

export class FiltersDto {
  @ApiProperty({ type: [String] }) genres: string[];
  @ApiProperty({ type: [String] }) languages: string[];
  @ApiProperty({ type: [String] }) tags: string[];
  @ApiProperty({ type: Number, nullable: true }) minYear: number | null;
  @ApiProperty({ type: Number, nullable: true }) maxYear: number | null;
}

export class SearchQueryDto {
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(200) q?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(100) genre?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(10) language?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(100) tag?: string;
  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  yearFrom?: number;
  @ApiPropertyOptional({ type: Number }) @IsOptional() @Type(() => Number) @IsInt() yearTo?: number;
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  available?: boolean;
  @ApiPropertyOptional({ enum: SORTS }) @IsOptional() @IsIn(SORTS) sort?: (typeof SORTS)[number];
  @ApiPropertyOptional({ type: Number, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
  @ApiPropertyOptional({ type: Number, default: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class BookInputDto {
  @ApiProperty({ type: String }) @IsString() @Length(1, 300) title: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(20) isbn?: string;
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(10) language?: string;
  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3000)
  publishedYear?: number;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(100) genre?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  authors?: string[];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  tags?: string[];
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(200) series?: string;
  @ApiPropertyOptional({ type: Number }) @IsOptional() @IsInt() @Min(0) seriesNumber?: number;
  @ApiPropertyOptional({ type: String, description: 'Externe cover-URL' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  coverUrl?: string;
}

export class CopyInputDto {
  @ApiPropertyOptional({ type: String, description: 'Leeg = automatisch genereren' })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  barcode?: string;
}

export class CopyUpdateDto {
  @ApiProperty({ enum: ['AVAILABLE', 'LOANED', 'RESERVED_HOLD', 'LOST', 'DAMAGED'] })
  @IsIn(['AVAILABLE', 'LOANED', 'RESERVED_HOLD', 'LOST', 'DAMAGED'])
  status: 'AVAILABLE' | 'LOANED' | 'RESERVED_HOLD' | 'LOST' | 'DAMAGED';
}

export class NameDto {
  @ApiProperty({ type: String }) @IsString() @Length(1, 200) name: string;
}

export class NamedDto {
  @ApiProperty({ type: Number }) id: number;
  @ApiProperty({ type: String }) name: string;
  @ApiProperty({ type: Number }) books: number;
}

export class IsbnMetadataDto {
  @ApiProperty({ type: String }) isbn: string;
  @ApiProperty({ type: String }) title: string;
  @ApiProperty({ type: [String] }) authors: string[];
  @ApiProperty({ type: String, nullable: true }) description: string | null;
  @ApiProperty({ type: Number, nullable: true }) publishedYear: number | null;
  @ApiProperty({ type: String, nullable: true }) language: string | null;
  @ApiProperty({ type: String, nullable: true }) coverUrl: string | null;
}

export class ImportResultDto {
  @ApiProperty({ type: Number }) created: number;
  @ApiProperty({ type: Number }) updated: number;
  @ApiProperty({ type: [String] }) errors: string[];
}
