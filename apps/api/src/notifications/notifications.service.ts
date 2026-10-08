import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Notification, Prisma } from '@prisma/client';
import { JobsService } from '../jobs/jobs.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from './events.service';
import { NotificationType, renderNotification, TemplateData } from './templates';

const EMAIL_JOB = 'send-notification-email';

@Injectable()
export class NotificationsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly jobs: JobsService,
    private readonly events: EventsService,
  ) {}

  onModuleInit() {
    this.jobs.register(EMAIL_JOB, (data: { notificationId: number }) =>
      this.sendEmail(data.notificationId),
    );
  }

  /** Maakt de melding binnen de lopende transactie aan; verstuur daarna met `dispatch`. */
  async create(
    tx: Prisma.TransactionClient,
    userId: number,
    type: NotificationType,
    data: TemplateData,
  ): Promise<Notification> {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { locale: true },
    });
    const { title, body } = renderNotification(type, user.locale, data);
    return tx.notification.create({ data: { userId, type, title, body } });
  }

  /** Na commit: realtime event + e-mail via de job-queue (met retries). */
  async dispatch(notifications: Notification[]): Promise<void> {
    for (const n of notifications) {
      this.events.emit({
        type: 'notification',
        userId: n.userId,
        notificationId: n.id,
        title: n.title,
      });
      await this.jobs.enqueue(EMAIL_JOB, { notificationId: n.id });
    }
  }

  async sendEmail(notificationId: number): Promise<void> {
    const n = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      include: { user: true },
    });
    if (!n || n.emailedAt) return;
    await this.mail.send(
      { to: n.user.email, subject: n.title, text: `${n.body}\n\n— BiblioApp` },
      { throwOnError: true },
    );
    await this.prisma.notification.update({ where: { id: n.id }, data: { emailedAt: new Date() } });
  }

  async list(userId: number, unreadOnly = false) {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { items, unread };
  }

  async markRead(userId: number, id: number) {
    const res = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (res.count === 0 && !(await this.prisma.notification.findFirst({ where: { id, userId } }))) {
      throw new NotFoundException('Melding niet gevonden');
    }
  }

  async markAllRead(userId: number) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
