import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, Length } from 'class-validator';
import type { AuthedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/decorators';
import { AdminService } from './admin.service';

class AdminUserDto {
  @ApiProperty({ type: Number }) id: number;
  @ApiProperty({ type: String }) email: string;
  @ApiProperty({ type: String }) name: string;
  @ApiProperty({ enum: ['MEMBER', 'LIBRARIAN', 'ADMIN'] }) role: string;
  @ApiProperty({ type: String, nullable: true }) memberNumber: string | null;
  @ApiProperty({ type: Boolean }) disabled: boolean;
  @ApiProperty({ type: Boolean }) totpEnabled: boolean;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: string;
}

class UpdateUserDto {
  @ApiPropertyOptional({ enum: ['MEMBER', 'LIBRARIAN', 'ADMIN'] })
  @IsOptional()
  @IsIn(['MEMBER', 'LIBRARIAN', 'ADMIN'])
  role?: 'MEMBER' | 'LIBRARIAN' | 'ADMIN';
  @ApiPropertyOptional({ type: Boolean }) @IsOptional() @IsBoolean() disabled?: boolean;
}

class AuditItemDto {
  @ApiProperty({ type: Number }) id: number;
  @ApiProperty({ type: String }) action: string;
  @ApiProperty({ type: Number, nullable: true }) userId: number | null;
  @ApiProperty({ type: String, nullable: true }) userEmail: string | null;
  @ApiProperty({ type: String, nullable: true }) detail: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: string;
}
class AuditPageDto {
  @ApiProperty({ type: Number }) total: number;
  @ApiProperty({ type: Number }) page: number;
  @ApiProperty({ type: Number }) pageSize: number;
  @ApiProperty({ type: [AuditItemDto] }) items: AuditItemDto[];
}

class TemplateDto {
  @ApiProperty({ type: String }) type: string;
  @ApiProperty({ enum: ['nl', 'en'] }) locale: string;
  @ApiProperty({ type: String }) subject: string;
  @ApiProperty({ type: String }) body: string;
  @ApiProperty({ type: Boolean }) customized: boolean;
  @ApiProperty({ type: String }) defaultSubject: string;
  @ApiProperty({ type: String }) defaultBody: string;
  @ApiProperty({ type: [String] }) placeholders: string[];
}
class SaveTemplateDto {
  @ApiProperty({ type: String }) @IsString() @Length(1, 200) subject: string;
  @ApiProperty({ type: String }) @IsString() @Length(1, 5000) body: string;
}

@ApiTags('admin')
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  @ApiQuery({ name: 'q', required: false })
  @ApiOkResponse({ type: [AdminUserDto] })
  users(@Query('q') q?: string) {
    return this.admin.users(q);
  }

  @Patch('users/:id')
  @ApiOkResponse({ type: AdminUserDto })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @Req() req: AuthedRequest,
  ) {
    return this.admin.updateUser(id, dto, req.user!.id);
  }

  @Get('audit')
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiOkResponse({ type: AuditPageDto })
  audit(
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('page') page?: string,
  ) {
    return this.admin.auditLog({
      action: action || undefined,
      userId: userId ? Number(userId) : undefined,
      page: page ? Number(page) : undefined,
    });
  }

  @Get('email-templates')
  @ApiOkResponse({ type: [TemplateDto] })
  templates() {
    return this.admin.templates();
  }

  @Put('email-templates/:type/:locale')
  @ApiOkResponse({ type: TemplateDto })
  saveTemplate(
    @Param('type') type: string,
    @Param('locale') locale: string,
    @Body() dto: SaveTemplateDto,
    @Req() req: AuthedRequest,
  ) {
    return this.admin.saveTemplate(type, locale, dto.subject, dto.body, req.user!.id);
  }

  @Delete('email-templates/:type/:locale')
  @HttpCode(204)
  resetTemplate(
    @Param('type') type: string,
    @Param('locale') locale: string,
    @Req() req: AuthedRequest,
  ) {
    return this.admin.resetTemplate(type, locale, req.user!.id);
  }
}
