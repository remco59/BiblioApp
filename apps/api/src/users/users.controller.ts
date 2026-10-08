import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthedRequest } from '../auth/auth.guard';
import { UpdateProfileDto } from '../auth/dto';
import { Roles } from '../auth/decorators';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { PrivacyService } from '../privacy/privacy.service';

@ApiTags('users')
@Controller()
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly privacy: PrivacyService,
  ) {}

  @Patch('users/me')
  @ApiOkResponse({ description: 'Profiel bijgewerkt' })
  async updateProfile(@Req() req: AuthedRequest, @Body() dto: UpdateProfileDto) {
    const u = await this.prisma.user.update({
      where: { id: req.user!.id },
      data: { name: dto.name },
    });
    return { id: u.id, name: u.name };
  }

  /** AVG: alle eigen gegevens als JSON. */
  @Get('users/me/export')
  @ApiOkResponse({ description: 'Export van alle persoonlijke gegevens' })
  async export(@Req() req: AuthedRequest) {
    await this.audit.log('users.export', req.user!.id);
    return this.privacy.exportFor(req.user!.id);
  }

  @Get('staff/ping')
  @Roles('LIBRARIAN', 'ADMIN')
  @ApiOkResponse({ description: 'Alleen voor medewerkers' })
  staffPing() {
    return { ok: true };
  }

  @Get('admin/ping')
  @Roles('ADMIN')
  @ApiOkResponse({ description: 'Alleen voor beheerders' })
  adminPing() {
    return { ok: true };
  }
}
