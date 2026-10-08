import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { PrismaService } from '../prisma/prisma.service';
import { SESSION_COOKIE } from './auth.guard';
import type { AuthedRequest as AuthGuardRequest } from './auth.guard';
import { RateLimit } from './rate-limit';
import { AuthService } from './auth.service';
import { Public } from './decorators';
import {
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  RecoveryCodesDto,
  ResetPasswordDto,
  SessionUserDto,
  TokenDto,
  TotpCodeDto,
  TotpDisableDto,
  TotpSetupDto,
} from './dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @RateLimit('register')
  @Post('register')
  @HttpCode(204)
  async register(@Body() dto: RegisterDto) {
    await this.auth.register(dto.email, dto.name, dto.password);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(204)
  async verify(@Body() dto: TokenDto) {
    await this.auth.verifyEmail(dto.token);
  }

  @Public()
  @RateLimit('login')
  @Post('login')
  @HttpCode(200)
  @ApiOkResponse({ type: SessionUserDto })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: FastifyReply) {
    const { token, user } = await this.auth.login(dto.email, dto.password, dto.totp);
    res.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 7 * 24 * 3600,
    });
    return user;
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: AuthGuardRequest, @Res({ passthrough: true }) res: FastifyReply) {
    await this.auth.logout(req.user!.sessionId, req.user!.id);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Get('me')
  @ApiOkResponse({ type: SessionUserDto })
  async me(@Req() req: AuthGuardRequest) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: req.user!.id },
      include: { member: true },
    });
    return this.auth.toDto(user, req.user!.csrfToken);
  }

  @Public()
  @RateLimit('forgot-password')
  @Post('forgot-password')
  @HttpCode(204)
  async forgot(@Body() dto: ForgotPasswordDto) {
    await this.auth.forgotPassword(dto.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(204)
  async reset(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.token, dto.password);
  }

  @Post('2fa/setup')
  @HttpCode(200)
  @ApiOkResponse({ type: TotpSetupDto })
  setup2fa(@Req() req: AuthGuardRequest) {
    return this.auth.setupTotp(req.user!.id);
  }

  @Post('2fa/enable')
  @HttpCode(200)
  @ApiOkResponse({ type: RecoveryCodesDto })
  async enable2fa(
    @Body() dto: TotpCodeDto,
    @Req() req: AuthGuardRequest,
  ): Promise<RecoveryCodesDto> {
    return { codes: await this.auth.enableTotp(req.user!.id, dto.code) };
  }

  @Post('2fa/disable')
  @HttpCode(204)
  async disable2fa(@Body() dto: TotpDisableDto, @Req() req: AuthGuardRequest) {
    await this.auth.disableTotp(req.user!.id, dto.password, dto.code);
  }
}
