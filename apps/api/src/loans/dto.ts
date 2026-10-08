import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
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

export class CheckoutDto {
  @ApiProperty({ type: String, description: 'Lidnummer (pas) van het lid' })
  @IsString()
  @Length(1, 50)
  memberNumber: string;
  @ApiProperty({ type: String, description: 'Barcode van het exemplaar' })
  @IsString()
  @Length(1, 50)
  barcode: string;
}

export class CheckinDto {
  @ApiProperty({ type: String }) @IsString() @Length(1, 50) barcode: string;
  @ApiPropertyOptional({ enum: ['OK', 'DAMAGED'], default: 'OK' })
  @IsOptional()
  @IsIn(['OK', 'DAMAGED'])
  condition?: 'OK' | 'DAMAGED';
}

export class LoanDto {
  @ApiProperty({ type: Number }) id: number;
  @ApiProperty({ type: Number }) bookId: number;
  @ApiProperty({ type: String }) title: string;
  @ApiProperty({ type: String }) barcode: string;
  @ApiProperty({ type: Number }) memberId: number;
  @ApiProperty({ type: String }) memberNumber: string;
  @ApiProperty({ type: String }) memberName: string;
  @ApiProperty({ type: String, format: 'date-time' }) loanedAt: string;
  @ApiProperty({ type: String, format: 'date-time' }) dueAt: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) returnedAt: string | null;
  @ApiProperty({ enum: ['RETURNED', 'LOST', 'DAMAGED'], nullable: true }) outcome: string | null;
  @ApiProperty({ type: Number }) renewals: number;
  @ApiProperty({ type: Boolean, description: 'Actief en over de uiterste inleverdatum' })
  overdue: boolean;
  @ApiProperty({ type: Boolean, description: 'Kan het lid dit nog verlengen?' }) canRenew: boolean;
}

export class FineDto {
  @ApiProperty({ type: Number }) id: number;
  @ApiProperty({ type: Number }) memberId: number;
  @ApiProperty({ type: Number, nullable: true }) loanId: number | null;
  @ApiProperty({ type: String, nullable: true }) title: string | null;
  @ApiProperty({ enum: ['OVERDUE', 'LOST', 'DAMAGED'] }) reason: string;
  @ApiProperty({ type: Number }) amountCents: number;
  @ApiProperty({ type: Number }) paidCents: number;
  @ApiProperty({ type: Number, description: 'Nog te betalen (0 als betaald of kwijtgescholden)' })
  outstandingCents: number;
  @ApiProperty({ enum: ['OPEN', 'PAID', 'WAIVED'] }) status: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: string;
}

export class CheckinResultDto {
  @ApiProperty({ type: LoanDto }) loan: LoanDto;
  @ApiProperty({ type: FineDto, nullable: true }) fine: FineDto | null;
  @ApiProperty({ type: Number }) daysLate: number;
}

export class MemberDto {
  @ApiProperty({ type: Number }) id: number;
  @ApiProperty({ type: Number }) userId: number;
  @ApiProperty({ type: String }) memberNumber: string;
  @ApiProperty({ type: String }) name: string;
  @ApiProperty({ type: String }) email: string;
  @ApiProperty({ type: String, format: 'date-time' }) membershipUntil: string;
  @ApiProperty({ type: Boolean }) membershipValid: boolean;
  @ApiProperty({ type: Boolean }) blocked: boolean;
  @ApiProperty({ type: String, nullable: true }) blockedReason: string | null;
  @ApiProperty({ type: Number }) activeLoans: number;
  @ApiProperty({ type: Number }) overdueLoans: number;
  @ApiProperty({ type: Number }) outstandingFinesCents: number;
}

export class MemberDetailDto extends MemberDto {
  @ApiProperty({ type: [LoanDto] }) loans: LoanDto[];
  @ApiProperty({ type: [FineDto] }) fines: FineDto[];
}

export class BlockDto {
  @ApiProperty({ type: Boolean }) @IsBoolean() blocked: boolean;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

export class ExtendDto {
  @ApiPropertyOptional({ type: Number, description: 'Aantal maanden (standaard: instelling)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  months?: number;
}

export class PayDto {
  @ApiProperty({ type: Number, description: 'Bedrag in centen' })
  @IsInt()
  @Min(1)
  amountCents: number;
  @ApiPropertyOptional({ type: String, default: 'CASH' })
  @IsOptional()
  @IsIn(['CASH', 'CARD'])
  method?: 'CASH' | 'CARD';
}

export class SettingsDto {
  @ApiProperty({ type: Number }) loanDays: number;
  @ApiProperty({ type: Number }) maxRenewals: number;
  @ApiProperty({ type: Number }) renewalDays: number;
  @ApiProperty({ type: Number }) maxLoansPerMember: number;
  @ApiProperty({ type: Number }) finePerDayCents: number;
  @ApiProperty({ type: Number }) fineCapCents: number;
  @ApiProperty({
    type: Number,
    description: 'Vanaf dit openstaande bedrag mag een lid niet meer lenen',
  })
  blockFinesThresholdCents: number;
  @ApiProperty({ type: Number }) lostFeeCents: number;
  @ApiProperty({ type: Number }) damagedFeeCents: number;
  @ApiProperty({ type: Number }) membershipMonths: number;
}

export class UpdateSettingsDto {
  @ApiPropertyOptional({ type: Number }) @IsOptional() @IsInt() @Min(1) @Max(365) loanDays?: number;
  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  maxRenewals?: number;
  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  renewalDays?: number;
  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxLoansPerMember?: number;
  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  finePerDayCents?: number;
  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  fineCapCents?: number;
  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  blockFinesThresholdCents?: number;
  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  lostFeeCents?: number;
  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  damagedFeeCents?: number;
  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  membershipMonths?: number;
}

export class LabelDto {
  @ApiProperty({ type: String }) barcode: string;
  @ApiProperty({ type: String }) title: string;
  @ApiProperty({ type: Number }) bookId: number;
}
