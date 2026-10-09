import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { AuthedRequest } from '../auth/auth.guard';
import { Public, Roles } from '../auth/decorators';
import { PrismaService } from '../prisma/prisma.service';
import {
  BlockDto,
  CheckinDto,
  CheckinResultDto,
  CheckoutDto,
  ExtendDto,
  FineDto,
  LabelDto,
  LoanDto,
  LoanRulesDto,
  MemberDetailDto,
  MemberDto,
  PayDto,
  SettingsDto,
  UpdateSettingsDto,
} from './dto';
import { LoansService, loanInclude } from './loans.service';
import { MembersService } from './members.service';
import { SettingsService } from './settings.service';

/** Balie: uitlenen, innemen, ledenbeheer en boetes. Alleen medewerkers. */
@ApiTags('desk')
@Roles('LIBRARIAN', 'ADMIN')
@Controller('staff')
export class DeskController {
  constructor(
    private readonly loans: LoansService,
    private readonly members: MembersService,
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('loans/checkout')
  @ApiOkResponse({ type: LoanDto })
  checkout(@Body() dto: CheckoutDto, @Req() req: AuthedRequest) {
    return this.loans.checkout(dto.memberNumber.trim(), dto.barcode.trim(), req.user!.id);
  }

  @Post('loans/checkin')
  @HttpCode(200)
  @ApiOkResponse({ type: CheckinResultDto })
  checkin(@Body() dto: CheckinDto, @Req() req: AuthedRequest) {
    return this.loans.checkin(dto.barcode.trim(), dto.condition ?? 'OK', req.user!.id);
  }

  @Post('loans/:id/lost')
  @HttpCode(200)
  @ApiOkResponse({ type: CheckinResultDto })
  lost(@Param('id', ParseIntPipe) id: number, @Req() req: AuthedRequest) {
    return this.loans.markLost(id, req.user!.id);
  }

  @Post('loans/:id/renew')
  @HttpCode(200)
  @ApiOkResponse({ type: LoanDto })
  renew(@Param('id', ParseIntPipe) id: number, @Req() req: AuthedRequest) {
    return this.loans.renew(id, { id: req.user!.id, isStaff: true });
  }

  @Get('loans')
  @ApiQuery({ name: 'status', enum: ['active', 'overdue'], required: false })
  @ApiOkResponse({ type: [LoanDto] })
  async list(@Query('status') status?: string) {
    const now = new Date();
    const [rows, s] = await Promise.all([
      this.prisma.loan.findMany({
        where: { returnedAt: null, ...(status === 'overdue' ? { dueAt: { lt: now } } : {}) },
        include: loanInclude,
        orderBy: { dueAt: 'asc' },
        take: 200,
      }),
      this.settings.getAll(),
    ]);
    return rows.map((l) => this.loans.toDto(l, s, now));
  }

  @Get('members')
  @ApiQuery({ name: 'q', required: false })
  @ApiOkResponse({ type: [MemberDto] })
  searchMembers(@Query('q') q?: string) {
    return this.members.search(q);
  }

  @Get('members/:id')
  @ApiOkResponse({ type: MemberDetailDto })
  member(@Param('id', ParseIntPipe) id: number) {
    return this.members.detail(id);
  }

  @Patch('members/:id/block')
  @ApiOkResponse({ type: MemberDto })
  block(@Param('id', ParseIntPipe) id: number, @Body() dto: BlockDto, @Req() req: AuthedRequest) {
    return this.members.setBlocked(id, dto.blocked, dto.reason, req.user!.id);
  }

  @Post('members/:id/extend')
  @HttpCode(200)
  @ApiOkResponse({ type: MemberDto })
  extend(@Param('id', ParseIntPipe) id: number, @Body() dto: ExtendDto, @Req() req: AuthedRequest) {
    return this.members.extend(id, dto.months, req.user!.id);
  }

  @Post('fines/:id/pay')
  @HttpCode(200)
  @ApiOkResponse({ type: FineDto })
  pay(@Param('id', ParseIntPipe) id: number, @Body() dto: PayDto, @Req() req: AuthedRequest) {
    return this.members.payFine(id, dto.amountCents, dto.method ?? 'CASH', req.user!.id);
  }

  @Post('fines/:id/waive')
  @HttpCode(200)
  @ApiOkResponse({ type: FineDto })
  waive(@Param('id', ParseIntPipe) id: number, @Req() req: AuthedRequest) {
    return this.members.waiveFine(id, req.user!.id);
  }

  @Get('settings')
  @ApiOkResponse({ type: SettingsDto })
  getSettings() {
    return this.settings.getAll();
  }

  /** Data voor barcode-etiketten: alle exemplaren, of die van één boek. */
  @Get('labels')
  @ApiQuery({ name: 'bookId', required: false })
  @ApiOkResponse({ type: [LabelDto] })
  async labels(@Query('bookId') bookId?: string) {
    const rows = await this.prisma.copy.findMany({
      where: bookId ? { bookId: Number(bookId) } : undefined,
      include: { book: { select: { title: true } } },
      orderBy: { barcode: 'asc' },
      take: 500,
    });
    return rows.map((c) => ({ barcode: c.barcode, title: c.book.title, bookId: c.bookId }));
  }
}

@ApiTags('admin')
@Roles('ADMIN')
@Controller('admin')
export class AdminSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Patch('settings')
  @ApiOkResponse({ type: SettingsDto })
  update(@Body() dto: UpdateSettingsDto) {
    return this.settings.update(dto);
  }
}

/** Openbare leenregels, zodat leden weten hoe lenen werkt. */
@ApiTags('rules')
@Controller('rules')
export class RulesController {
  constructor(private readonly settings: SettingsService) {}

  @Public()
  @Get()
  @ApiOkResponse({ type: LoanRulesDto })
  async get(): Promise<LoanRulesDto> {
    const s = await this.settings.getAll();
    return {
      loanDays: s.loanDays,
      maxRenewals: s.maxRenewals,
      renewalDays: s.renewalDays,
      maxLoansPerMember: s.maxLoansPerMember,
      finePerDayCents: s.finePerDayCents,
      fineCapCents: s.fineCapCents,
      reservationHoldDays: s.reservationHoldDays,
    };
  }
}

/** Eigen uitleningen en boetes voor ingelogde leden. */
@ApiTags('me')
@Controller('me')
export class MeController {
  constructor(
    private readonly loans: LoansService,
    private readonly members: MembersService,
  ) {}

  @Get('membership')
  @ApiOkResponse({ type: MemberDetailDto })
  membership(@Req() req: AuthedRequest) {
    return this.members.detailByUser(req.user!.id);
  }

  @Post('loans/:id/renew')
  @HttpCode(200)
  @ApiOkResponse({ type: LoanDto })
  renew(@Param('id', ParseIntPipe) id: number, @Req() req: AuthedRequest) {
    return this.loans.renew(id, { id: req.user!.id, isStaff: false });
  }
}
