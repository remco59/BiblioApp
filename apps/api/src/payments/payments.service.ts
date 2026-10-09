import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { DomainError } from '../loans/errors';
import { PrismaService } from '../prisma/prisma.service';

export type ProviderStatus = 'PENDING' | 'PAID' | 'FAILED';

/**
 * Koppelvlak voor een betaalprovider (bijv. Mollie of Stripe). Een echte provider maakt in
 * `createCheckout` een betaling aan en geeft de betaal-URL terug; `fetchStatus` vraagt de status op
 * bij de provider (nooit de webhook-body vertrouwen).
 */
export interface PaymentProvider {
  readonly name: string;
  createCheckout(input: {
    reference: string;
    amountCents: number;
    description: string;
    returnUrl: string;
  }): Promise<{ providerRef: string; checkoutUrl: string }>;
  fetchStatus(providerRef: string): Promise<ProviderStatus>;
}

export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';

/** Nep-provider voor ontwikkeling en tests: de "betaalpagina" is een eigen scherm van de app. */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  readonly outcomes = new Map<string, ProviderStatus>();

  async createCheckout({
    returnUrl,
  }: {
    reference: string;
    amountCents: number;
    description: string;
    returnUrl: string;
  }) {
    const providerRef = `mock_${randomBytes(12).toString('hex')}`;
    this.outcomes.set(providerRef, 'PENDING');
    const base = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
    return {
      providerRef,
      checkoutUrl: `${base}/pay/mock/${providerRef}?return=${encodeURIComponent(returnUrl)}`,
    };
  }

  async fetchStatus(providerRef: string): Promise<ProviderStatus> {
    return this.outcomes.get(providerRef) ?? 'FAILED';
  }

  complete(providerRef: string, status: 'PAID' | 'FAILED') {
    if (!this.outcomes.has(providerRef)) throw new NotFoundException();
    this.outcomes.set(providerRef, status);
  }
}

@Injectable()
export class PaymentsService {
  readonly provider: PaymentProvider | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {
    // Alleen "mock" is ingebouwd; een echte provider wordt hier geregistreerd (zie docs).
    this.provider =
      (process.env.PAYMENT_PROVIDER ??
        (process.env.NODE_ENV === 'production' ? 'none' : 'mock')) === 'mock'
        ? new MockPaymentProvider()
        : null;
  }

  private requireProvider(): PaymentProvider {
    if (!this.provider)
      throw new DomainError(
        'Online betalen is niet beschikbaar',
        'PAYMENTS_DISABLED',
        HttpStatus.NOT_IMPLEMENTED,
      );
    return this.provider;
  }

  get mock(): MockPaymentProvider {
    if (!(this.provider instanceof MockPaymentProvider)) throw new NotFoundException();
    return this.provider;
  }

  /** Start een online betaling voor het volledige openstaande bedrag van een eigen boete. */
  async start(userId: number, fineId: number) {
    const provider = this.requireProvider();
    const fine = await this.prisma.fine.findFirst({
      where: { id: fineId, member: { userId } },
      include: { payments: true },
    });
    if (!fine) throw new DomainError('Boete niet gevonden', 'FINE_NOT_FOUND', HttpStatus.NOT_FOUND);
    const outstanding = fine.amountCents - fine.payments.reduce((s, p) => s + p.amountCents, 0);
    if (fine.waivedAt || outstanding <= 0)
      throw new DomainError('Deze boete staat niet open', 'FINE_NOT_OPEN');
    const pending = await this.prisma.onlinePayment.findFirst({
      where: { fineId, status: 'PENDING' },
    });
    if (pending) {
      await this.settle(pending.providerRef); // een eerdere poging kan inmiddels betaald zijn
      const again = await this.prisma.fine.findUniqueOrThrow({
        where: { id: fineId },
        include: { payments: true },
      });
      if (again.amountCents - again.payments.reduce((s, p) => s + p.amountCents, 0) <= 0) {
        throw new DomainError('Deze boete is inmiddels betaald', 'FINE_NOT_OPEN');
      }
    }
    const base = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
    const created = await provider.createCheckout({
      reference: `fine-${fineId}`,
      amountCents: outstanding,
      description: `Boete #${fineId}`,
      returnUrl: `${base}/my/loans?betaling=${fineId}`,
    });
    const payment = await this.prisma.onlinePayment.create({
      data: {
        fineId,
        amountCents: outstanding,
        provider: provider.name,
        providerRef: created.providerRef,
      },
    });
    await this.audit.log('payment.start', userId, { fineId, paymentId: payment.id });
    return { paymentId: payment.id, checkoutUrl: created.checkoutUrl };
  }

  /** Verwerkt de status bij de provider; idempotent (een betaling wordt maximaal één keer geboekt). */
  async settle(providerRef: string): Promise<'PENDING' | 'PAID' | 'FAILED'> {
    const provider = this.requireProvider();
    const op = await this.prisma.onlinePayment.findUnique({ where: { providerRef } });
    if (!op) throw new NotFoundException('Betaling niet gevonden');
    if (op.status !== 'PENDING') return op.status;
    const status = await provider.fetchStatus(providerRef);
    if (status === 'PENDING') return 'PENDING';
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.onlinePayment.updateMany({
        where: { id: op.id, status: 'PENDING' },
        data: { status, paidAt: status === 'PAID' ? new Date() : null },
      });
      if (claimed.count !== 1 || status !== 'PAID') return;
      const [locked] = await tx.$queryRaw<
        { id: number }[]
      >`SELECT "id" FROM "Fine" WHERE "id" = ${op.fineId} FOR UPDATE`;
      if (!locked) return;
      const fine = await tx.fine.findUniqueOrThrow({
        where: { id: op.fineId },
        include: { payments: true },
      });
      const outstanding = fine.waivedAt
        ? 0
        : fine.amountCents - fine.payments.reduce((s, p) => s + p.amountCents, 0);
      const amount = Math.min(op.amountCents, Math.max(outstanding, 0));
      if (amount > 0)
        await tx.payment.create({
          data: { fineId: op.fineId, amountCents: amount, method: 'ONLINE' },
        });
    });
    await this.audit.log('payment.settle', null, { providerRef, status });
    return status;
  }

  async get(providerRef: string) {
    const op = await this.prisma.onlinePayment.findUnique({
      where: { providerRef },
      include: { fine: true },
    });
    if (!op) throw new NotFoundException();
    return {
      providerRef: op.providerRef,
      amountCents: op.amountCents,
      status: op.status,
      description: `Boete #${op.fineId}`,
    };
  }
}
