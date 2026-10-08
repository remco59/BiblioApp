import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { hash } from '@node-rs/argon2';
import type { Response as LightMyRequestResponse } from 'light-my-request';
import { AppModule } from '../src/app.module';
import { MailMessage, MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { setup } from '../src/setup';

export class MailStub {
  sent: MailMessage[] = [];
  async send(m: MailMessage) {
    this.sent.push(m);
  }
  last(to: string) {
    return [...this.sent].reverse().find((m) => m.to === to);
  }
  /** Haalt het token uit de laatste mail aan `to`. */
  tokenFor(to: string) {
    return /token=([\w-]+)/.exec(this.last(to)?.text ?? '')?.[1] ?? '';
  }
}

export async function createApp() {
  process.env.JOBS_DISABLED = '1'; // jobs inline uitvoeren i.p.v. via pg-boss
  const mail = new MailStub();
  const mod = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue(mail)
    .compile();
  const app = mod.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await setup(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return { app, mail, prisma: app.get(PrismaService) };
}

/** Leegt alle gegevens die naar leden, exemplaren of boeken verwijzen (volgorde: kinderen eerst). */
async function clearActivity(prisma: PrismaService) {
  await prisma.notification.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.onlinePayment.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.fine.deleteMany();
  await prisma.loan.deleteMany();
  await prisma.review.deleteMany();
  await prisma.wishlistItem.deleteMany();
  await prisma.suggestion.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.emailTemplate.deleteMany();
}

export async function resetCatalog(prisma: PrismaService) {
  await clearActivity(prisma);
  await prisma.copy.deleteMany();
  await prisma.bookTag.deleteMany();
  await prisma.bookAuthor.deleteMany();
  await prisma.book.deleteMany();
  await prisma.author.deleteMany();
  await prisma.genre.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.series.deleteMany();
}

export async function resetDb(prisma: PrismaService) {
  await clearActivity(prisma);
  await prisma.recoveryCode.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.emailToken.deleteMany();
  await prisma.session.deleteMany();
  await prisma.member.deleteMany();
  await prisma.user.deleteMany();
}

export const PASSWORD = 'Welkom-123456';

export async function createUser(
  prisma: PrismaService,
  email: string,
  role: 'MEMBER' | 'LIBRARIAN' | 'ADMIN',
  verified = true,
) {
  return prisma.user.create({
    data: {
      email,
      name: email.split('@')[0]!,
      role,
      passwordHash: await hash(PASSWORD),
      emailVerifiedAt: verified ? new Date() : null,
      member: {
        create: {
          memberNumber: `T-${email}`,
          membershipUntil: new Date(Date.now() + 365 * 86400000),
        },
      },
    },
  });
}

/** Logt in en geeft cookie + csrf-token terug. */
export async function login(
  app: NestFastifyApplication,
  email: string,
  password = PASSWORD,
): Promise<{ res: LightMyRequestResponse; cookie: string; csrf: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password },
  });
  const cookie = res.cookies.find((c) => c.name === 'sid');
  return { res, cookie: cookie ? `sid=${cookie.value}` : '', csrf: res.json().csrfToken as string };
}
