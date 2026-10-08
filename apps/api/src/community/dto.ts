import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';

export class ReviewInputDto {
  @ApiProperty({ type: Number }) @IsInt() @Min(1) bookId: number;
  @ApiProperty({ type: Number, minimum: 1, maximum: 5 }) @IsInt() @Min(1) @Max(5) rating: number;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(2000) body?: string;
}

export class ReviewDto {
  @ApiProperty({ type: Number }) id: number;
  @ApiProperty({ type: Number }) bookId: number;
  @ApiProperty({ type: String }) bookTitle: string;
  @ApiProperty({ type: String }) author: string;
  @ApiProperty({ type: Number }) rating: number;
  @ApiProperty({ type: String, nullable: true }) body: string | null;
  @ApiProperty({ enum: ['PENDING', 'APPROVED', 'REJECTED'] }) status: string;
  @ApiProperty({ type: String, nullable: true }) moderationNote: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: string;
}

export class ReviewSummaryDto {
  @ApiProperty({ type: Number, nullable: true }) average: number | null;
  @ApiProperty({ type: Number }) count: number;
  @ApiProperty({ type: [Number], description: 'Aantal reviews met 1, 2, 3, 4 en 5 sterren' })
  distribution: number[];
}

export class BookReviewsDto {
  @ApiProperty({ type: ReviewSummaryDto }) summary: ReviewSummaryDto;
  @ApiProperty({ type: [ReviewDto] }) items: ReviewDto[];
  @ApiProperty({
    type: ReviewDto,
    nullable: true,
    description: 'Je eigen review (ook als die nog niet goedgekeurd is)',
  })
  mine: ReviewDto | null;
  @ApiProperty({ type: Boolean, description: 'Heb je dit boek geleend en dus mag je reviewen?' })
  canReview: boolean;
}

export class ModerateDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] }) @IsIn(['APPROVED', 'REJECTED']) status:
    'APPROVED' | 'REJECTED';
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class WishlistAddDto {
  @ApiProperty({ type: Number }) @IsInt() @Min(1) bookId: number;
}

export const SUGGESTION_STATUSES = [
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'ORDERED',
  'ADDED',
] as const;

export class SuggestionInputDto {
  @ApiProperty({ type: String }) @IsString() @Length(1, 300) title: string;
  @ApiProperty({ type: String }) @IsString() @Length(1, 200) author: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(20) isbn?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class SuggestionDto {
  @ApiProperty({ type: Number }) id: number;
  @ApiProperty({ type: String }) title: string;
  @ApiProperty({ type: String }) author: string;
  @ApiProperty({ type: String, nullable: true }) isbn: string | null;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({ enum: SUGGESTION_STATUSES }) status: string;
  @ApiProperty({ type: String, nullable: true }) staffNote: string | null;
  @ApiProperty({ type: String }) memberName: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: string;
}

export class HandleSuggestionDto {
  @ApiProperty({ enum: SUGGESTION_STATUSES })
  @IsIn([...SUGGESTION_STATUSES])
  status: (typeof SUGGESTION_STATUSES)[number];
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(500) note?: string;
}
