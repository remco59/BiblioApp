import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { Roles } from '../auth/decorators';
import { Interval, ReportsService, parseRange } from './reports.service';

class PopularRowDto {
  @ApiProperty({ type: Number }) bookId: number;
  @ApiProperty({ type: String }) title: string;
  @ApiProperty({ type: String }) authors: string;
  @ApiProperty({ type: Number }) loans: number;
}
class VolumeRowDto {
  @ApiProperty({ type: String }) period: string;
  @ApiProperty({ type: Number }) loans: number;
  @ApiProperty({ type: Number }) returns: number;
}
class OverdueRowDto {
  @ApiProperty({ type: Number }) loanId: number;
  @ApiProperty({ type: String }) title: string;
  @ApiProperty({ type: String }) memberNumber: string;
  @ApiProperty({ type: String }) memberName: string;
  @ApiProperty({ type: String }) dueAt: string;
  @ApiProperty({ type: Number }) daysLate: number;
  @ApiProperty({ type: Number }) fineCents: number;
}
class FinePeriodDto {
  @ApiProperty({ type: String }) period: string;
  @ApiProperty({ type: Number }) issuedCents: number;
  @ApiProperty({ type: Number }) collectedCents: number;
}
class FinesReportDto {
  @ApiProperty({ type: Number }) issuedCents: number;
  @ApiProperty({ type: Number }) collectedCents: number;
  @ApiProperty({ type: Number }) waivedCents: number;
  @ApiProperty({ type: Number }) outstandingCents: number;
  @ApiProperty({ type: [FinePeriodDto] }) byPeriod: FinePeriodDto[];
}

const interval = (v?: string): Interval => (v === 'month' ? 'month' : 'day');

/** Rapportages voor medewerkers. Met `?format=csv` komt er een CSV-download. */
@ApiTags('reports')
@Roles('LIBRARIAN', 'ADMIN')
@Controller('staff/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  private csv(res: FastifyReply, name: string, body: string) {
    void res
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${name}.csv"`);
    return body;
  }

  @Get('popular')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'format', required: false })
  @ApiOkResponse({ type: [PopularRowDto] })
  async popular(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('format') format?: string,
    @Res({ passthrough: true }) res?: FastifyReply,
  ) {
    const rows = await this.reports.popular(
      parseRange(from, to),
      Math.min(Math.max(Number(limit) || 10, 1), 100),
    );
    return format === 'csv'
      ? this.csv(res!, 'populairste-boeken', this.reports.popularCsv(rows))
      : rows;
  }

  @Get('volume')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'interval', enum: ['day', 'month'], required: false })
  @ApiQuery({ name: 'format', required: false })
  @ApiOkResponse({ type: [VolumeRowDto] })
  async volume(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('interval') iv?: string,
    @Query('format') format?: string,
    @Res({ passthrough: true }) res?: FastifyReply,
  ) {
    const rows = await this.reports.volume(parseRange(from, to), interval(iv));
    return format === 'csv' ? this.csv(res!, 'uitleenvolume', this.reports.volumeCsv(rows)) : rows;
  }

  @Get('overdue')
  @ApiQuery({ name: 'format', required: false })
  @ApiOkResponse({ type: [OverdueRowDto] })
  async overdue(@Query('format') format?: string, @Res({ passthrough: true }) res?: FastifyReply) {
    const rows = await this.reports.overdue();
    return format === 'csv' ? this.csv(res!, 'achterstanden', this.reports.overdueCsv(rows)) : rows;
  }

  @Get('fines')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'interval', enum: ['day', 'month'], required: false })
  @ApiQuery({ name: 'format', required: false })
  @ApiOkResponse({ type: FinesReportDto })
  async fines(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('interval') iv?: string,
    @Query('format') format?: string,
    @Res({ passthrough: true }) res?: FastifyReply,
  ) {
    const report = await this.reports.fines(parseRange(from, to), iv === 'day' ? 'day' : 'month');
    return format === 'csv'
      ? this.csv(res!, 'boete-inkomsten', this.reports.finesCsv(report))
      : report;
  }
}
