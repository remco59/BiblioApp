import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Sse,
} from '@nestjs/common';
import { ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import type { AuthedRequest } from '../auth/auth.guard';
import { Public, Roles } from '../auth/decorators';
import { EventsService } from '../notifications/events.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  NightlyResultDto,
  NotificationDto,
  NotificationListDto,
  ReservationDto,
  ReserveDto,
} from './dto';
import { MaintenanceService } from './maintenance.service';
import { ReservationsService } from './reservations.service';

const toDto = (n: {
  id: number;
  type: string;
  title: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
}): NotificationDto => ({
  id: n.id,
  type: n.type,
  title: n.title,
  body: n.body,
  readAt: n.readAt?.toISOString() ?? null,
  createdAt: n.createdAt.toISOString(),
});

@ApiTags('reservations')
@Controller()
export class ReservationsController {
  constructor(
    private readonly reservations: ReservationsService,
    private readonly notifications: NotificationsService,
    private readonly maintenance: MaintenanceService,
    private readonly events: EventsService,
  ) {}

  // ---- leden ----

  @Post('me/reservations')
  @ApiOkResponse({ type: ReservationDto })
  reserve(@Body() dto: ReserveDto, @Req() req: AuthedRequest) {
    return this.reservations.reserve(req.user!.id, dto.bookId);
  }

  @Get('me/reservations')
  @ApiOkResponse({ type: [ReservationDto] })
  mine(@Req() req: AuthedRequest) {
    return this.reservations.forMember(req.user!.id);
  }

  @Post('me/reservations/:id/cancel')
  @HttpCode(200)
  @ApiOkResponse({ type: ReservationDto })
  cancel(@Param('id', ParseIntPipe) id: number, @Req() req: AuthedRequest) {
    return this.reservations.cancel(id, { id: req.user!.id, isStaff: false });
  }

  @Get('me/notifications')
  @ApiQuery({ name: 'unread', required: false })
  @ApiOkResponse({ type: NotificationListDto })
  async notificationsList(
    @Req() req: AuthedRequest,
    @Query('unread') unread?: string,
  ): Promise<NotificationListDto> {
    const { items, unread: count } = await this.notifications.list(req.user!.id, unread === 'true');
    return { items: items.map(toDto), unread: count };
  }

  @Post('me/notifications/read-all')
  @HttpCode(204)
  readAll(@Req() req: AuthedRequest) {
    return this.notifications.markAllRead(req.user!.id);
  }

  @Post('me/notifications/:id/read')
  @HttpCode(204)
  read(@Param('id', ParseIntPipe) id: number, @Req() req: AuthedRequest) {
    return this.notifications.markRead(req.user!.id, id);
  }

  /** Server-Sent Events: beschikbaarheid (iedereen) en eigen meldingen (ingelogd). */
  @Public()
  @Sse('events')
  stream(@Req() req: AuthedRequest): Observable<{ type: string; data: object }> {
    return this.events.stream(req.user?.id);
  }

  // ---- medewerkers ----

  @Get('staff/reservations')
  @Roles('LIBRARIAN', 'ADMIN')
  @ApiOkResponse({ type: [ReservationDto] })
  listActive() {
    return this.reservations.listActive();
  }

  @Post('staff/reservations/:id/cancel')
  @Roles('LIBRARIAN', 'ADMIN')
  @HttpCode(200)
  @ApiOkResponse({ type: ReservationDto })
  staffCancel(@Param('id', ParseIntPipe) id: number, @Req() req: AuthedRequest) {
    return this.reservations.cancel(id, { id: req.user!.id, isStaff: true });
  }

  @Post('staff/loans/:id/remind')
  @Roles('LIBRARIAN', 'ADMIN')
  @HttpCode(204)
  remind(@Param('id', ParseIntPipe) id: number, @Req() req: AuthedRequest) {
    return this.maintenance.remind(id, req.user!.id);
  }

  @Post('admin/jobs/nightly')
  @Roles('ADMIN')
  @HttpCode(200)
  @ApiOkResponse({ type: NightlyResultDto })
  runNightly() {
    return this.maintenance.runNightly();
  }
}
