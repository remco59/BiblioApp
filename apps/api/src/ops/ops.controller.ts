import {
  Controller,
  Get,
  Header,
  HttpException,
  HttpStatus,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Public } from '../auth/decorators';
import { JobsService } from '../jobs/jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from './metrics.service';

class ReadyDto {
  @ApiProperty({ type: String }) status: string;
  @ApiProperty({ type: Boolean }) database: boolean;
  @ApiProperty({ type: Boolean }) migrations: boolean;
  @ApiProperty({ type: Boolean, description: 'Job-queue actief (of bewust uitgeschakeld)' })
  jobs: boolean;
}

const safeEqual = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

@ApiTags('ops')
@Public()
@Controller()
export class OpsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly jobs: JobsService,
  ) {}

  /** Readiness: database bereikbaar, alle migraties afgerond en (indien aan) de job-queue draait. */
  @Get('health/ready')
  @ApiOkResponse({ type: ReadyDto })
  async ready(): Promise<ReadyDto> {
    let database = false;
    let migrations = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = true;
      const [row] = await this.prisma.$queryRaw<
        { pending: bigint }[]
      >`SELECT count(*) AS pending FROM "_prisma_migrations" WHERE "finished_at" IS NULL AND "rolled_back_at" IS NULL`;
      migrations = Number(row?.pending ?? 1) === 0;
    } catch {
      /* niet gereed */
    }
    const jobs = process.env.JOBS_DISABLED === '1' ? true : this.jobs.queueActive;
    const body: ReadyDto = {
      status: database && migrations && jobs ? 'ready' : 'not_ready',
      database,
      migrations,
      jobs,
    };
    if (body.status !== 'ready') throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
    return body;
  }

  /** Prometheus-metrics. Met METRICS_TOKEN alleen met `Authorization: Bearer <token>`; zonder token alleen buiten productie. */
  @Get('metrics')
  @Header('Cache-Control', 'no-store')
  async scrape(@Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    const token = process.env.METRICS_TOKEN;
    if (token) {
      const given = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? '';
      if (!safeEqual(given, token)) throw new UnauthorizedException();
    } else if (process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException();
    }
    void res.header('Content-Type', this.metrics.contentType);
    return this.metrics.render();
  }
}
