import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();
  readonly httpDuration: Histogram<'method' | 'route' | 'status'>;
  readonly httpErrors: Counter<'route' | 'status'>;

  constructor(private readonly prisma: PrismaService) {
    this.registry.setDefaultLabels({ service: 'biblio-api' });
    collectDefaultMetrics({ register: this.registry });
    this.httpDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duur van HTTP-verzoeken',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });
    this.httpErrors = new Counter({
      name: 'http_server_errors_total',
      help: 'Aantal 5xx-antwoorden',
      labelNames: ['route', 'status'],
      registers: [this.registry],
    });

    // Bedrijfsmetrics worden bij elke scrape uit de database gelezen
    const gauge = (name: string, help: string, read: () => Promise<number>) =>
      new Gauge({
        name,
        help,
        registers: [this.registry],
        async collect() {
          this.set(await read().catch(() => NaN));
        },
      });
    gauge('biblio_loans_active', 'Actieve uitleningen', () =>
      this.prisma.loan.count({ where: { returnedAt: null } }),
    );
    gauge('biblio_loans_overdue', 'Te late uitleningen', () =>
      this.prisma.loan.count({ where: { returnedAt: null, dueAt: { lt: new Date() } } }),
    );
    gauge('biblio_reservations_waiting', 'Wachtende reserveringen', () =>
      this.prisma.reservation.count({ where: { status: 'WAITING' } }),
    );
    gauge('biblio_reservations_ready', 'Klaargelegde reserveringen', () =>
      this.prisma.reservation.count({ where: { status: 'READY' } }),
    );
    gauge('biblio_members_total', 'Aantal leden', () => this.prisma.member.count());
    gauge(
      'biblio_emails_pending',
      'Meldingen ouder dan 10 min waarvan de e-mail nog niet is verstuurd',
      () =>
        this.prisma.notification.count({
          where: { emailedAt: null, createdAt: { lt: new Date(Date.now() - 10 * 60_000) } },
        }),
    );
  }

  render() {
    return this.registry.metrics();
  }

  get contentType() {
    return this.registry.contentType;
  }
}
