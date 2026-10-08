import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ type: String }) @IsEmail() @MaxLength(254) email: string;
  @ApiProperty({ type: String }) @IsString() @Length(1, 100) name: string;
  @ApiProperty({ type: String, minLength: 10 })
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password: string;
}

export class LoginDto {
  @ApiProperty({ type: String }) @IsEmail() email: string;
  @ApiProperty({ type: String }) @IsString() @MaxLength(128) password: string;
  @ApiPropertyOptional({
    type: String,
    description: '6-cijferige 2FA-code of een herstelcode (alleen bij ingeschakelde 2FA)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  totp?: string;
}

export class TotpSetupDto {
  @ApiProperty({ type: String, description: 'Base32-geheim voor de authenticator-app' })
  secret: string;
  @ApiProperty({ type: String, description: 'otpauth://-URL (voor een QR-code)' })
  otpauthUrl: string;
}

export class TotpCodeDto {
  @ApiProperty({ type: String }) @IsString() @MaxLength(32) code: string;
}

export class TotpDisableDto {
  @ApiProperty({ type: String }) @IsString() @MaxLength(128) password: string;
  @ApiProperty({ type: String }) @IsString() @MaxLength(32) code: string;
}

export class RecoveryCodesDto {
  @ApiProperty({ type: [String], description: 'Eenmalig te tonen; bewaar ze veilig' })
  codes: string[];
}

export class TokenDto {
  @ApiProperty({ type: String }) @IsString() @MaxLength(200) token: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ type: String }) @IsEmail() email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ type: String }) @IsString() @MaxLength(200) token: string;
  @ApiProperty({ type: String, minLength: 10 })
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @Length(1, 100) name?: string;
  @ApiPropertyOptional({ enum: ['nl', 'en'], description: 'Taal van meldingen en e-mails' })
  @IsOptional()
  @IsIn(['nl', 'en'])
  locale?: 'nl' | 'en';
}

export class SessionUserDto {
  @ApiProperty({ type: Number }) id: number;
  @ApiProperty({ type: String }) email: string;
  @ApiProperty({ type: String }) name: string;
  @ApiProperty({ enum: ['MEMBER', 'LIBRARIAN', 'ADMIN'] }) role: string;
  @ApiProperty({ enum: ['nl', 'en'] }) locale: string;
  @ApiProperty({ type: Boolean }) totpEnabled: boolean;
  @ApiProperty({ type: String, nullable: true }) memberNumber: string | null;
  @ApiProperty({ type: String, description: 'Stuur mee als X-CSRF-Token bij POST/PATCH/DELETE' })
  csrfToken: string;
}
