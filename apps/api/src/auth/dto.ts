import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, MaxLength, MinLength } from 'class-validator';

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
  @ApiProperty({ type: String }) @IsString() @Length(1, 100) name: string;
}

export class SessionUserDto {
  @ApiProperty({ type: Number }) id: number;
  @ApiProperty({ type: String }) email: string;
  @ApiProperty({ type: String }) name: string;
  @ApiProperty({ enum: ['MEMBER', 'LIBRARIAN', 'ADMIN'] }) role: string;
  @ApiProperty({ type: String, nullable: true }) memberNumber: string | null;
  @ApiProperty({ type: String, description: 'Stuur mee als X-CSRF-Token bij POST/PATCH/DELETE' })
  csrfToken: string;
}
