import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { verify } from '@node-rs/argon2';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { FastifyReply } from 'fastify';
import { AuthService } from '../auth/auth.service';
import { SESSION_COOKIE } from '../auth/auth.guard';
import type { AuthedRequest } from '../auth/auth.guard';
import { Public, Roles } from '../auth/decorators';
import { DomainError } from '../loans/errors';
import { PrismaService } from '../prisma/prisma.service';
import { PrivacyService } from './privacy.service';

class PolicyDto {
  @ApiProperty({ type: Number }) retentionLoanMonths: number;
  @ApiProperty({ type: Number }) retentionAuditMonths: number;
  @ApiProperty({ type: Number }) retentionNotificationDays: number;
  @ApiProperty({ type: Number }) retentionInactiveMemberMonths: number;
}

class DeleteAccountDto {
  @ApiProperty({ type: String }) @IsString() @MaxLength(128) password: string;
  @ApiProperty({
    type: String,
    required: false,
    description: '2FA-code of herstelcode (alleen als 2FA aanstaat)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  code?: string;
}

@ApiTags('privacy')
@Controller()
export class PrivacyController {
  constructor(
    private readonly privacy: PrivacyService,
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get('privacy/policy')
  @ApiOkResponse({ type: PolicyDto })
  policy() {
    return this.privacy.policy();
  }

  /** Eigen account laten verwijderen (anonimiseren). Vraagt wachtwoord en, indien aan, een 2FA-code. */
  @Post('me/account/delete')
  @HttpCode(204)
  async deleteAccount(
    @Body() dto: DeleteAccountDto,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!(await verify(user.passwordHash, dto.password).catch(() => false))) {
      throw new DomainError('Onjuist wachtwoord', 'PASSWORD_INVALID', 403);
    }
    if (user.totpEnabledAt && !(await this.auth.confirmSecondFactor(user, dto.code ?? ''))) {
      throw new DomainError('Onjuiste 2FA-code', 'TOTP_INVALID', 400);
    }
    await this.privacy.anonymize(user.id, user.id);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Post('admin/users/:id/anonymize')
  @Roles('ADMIN')
  @HttpCode(204)
  async adminAnonymize(@Param('id', ParseIntPipe) id: number, @Req() req: AuthedRequest) {
    await this.privacy.anonymize(id, req.user!.id);
  }
}
