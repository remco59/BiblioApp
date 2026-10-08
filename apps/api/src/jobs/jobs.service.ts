import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import PgBoss from 'pg-boss';

type Handler = (data: any) => Promise<void>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const NIGHTLY_JOB = 'nightly-maintenance';

/**
 * Dunne laag over pg-boss. Zonder werkende queue (`JOBS_DISABLED=1`, o.a. in tests) worden jobs
 * direct inline uitgevoerd, zodat gedrag deterministisch blijft.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private readonly handlers = new Map<string, Handler>();
  private boss?: PgBoss;

  register(name: string, handler: Handler) {
    this.handlers.set(name, handler);
  }

  get queueActive() {
    return !!this.boss;
  }

  async enqueue(name: string, data: object = {}): Promise<void> {
    if (!this.boss) {
      try {
        await this.handlers.get(name)?.(data);
      } catch (e) {
        // Inline (zonder queue) is er geen retry; een mislukte job mag de aanroeper niet breken.
        this.logger.error(`Job ${name} mislukt: ${(e as Error).message}`);
      }
      return;
    }
    await this.boss.send(name, data, { retryLimit: 5, retryDelay: 30, retryBackoff: true });
  }

  async onApplicationBootstrap() {
    if (process.env.JOBS_DISABLED === '1' || !process.env.DATABASE_URL) return;
    const boss = new PgBoss({ connectionString: process.env.DATABASE_URL, schema: 'pgboss' });
    boss.on('error', (err) => this.logger.error(`pg-boss: ${err.message}`));
    await boss.start();
    for (const [name, handler] of this.handlers) {
      await boss.createQueue(name);
      await boss.work(name, async (jobs) => {
        for (const job of jobs) await handler(job.data);
      });
    }
    // Elke nacht om 03:00 (server-tijd): herinneringen, te laat, verlopen reserveringen, lidmaatschap
    await boss.schedule(NIGHTLY_JOB, '0 3 * * *', {}, { tz: process.env.TZ ?? 'Europe/Amsterdam' });
    this.boss = boss;
    this.logger.log(`Job-queue gestart (${[...this.handlers.keys()].join(', ')})`);
  }

  async onModuleDestroy() {
    await this.boss?.stop({ graceful: true, timeout: 5000 });
  }
}
