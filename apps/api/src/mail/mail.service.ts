import { Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter?: Transporter;

  private get transport(): Transporter {
    this.transporter ??= createTransport({
      host: process.env.SMTP_HOST ?? 'localhost',
      port: Number(process.env.SMTP_PORT ?? 1025),
      secure: false,
    });
    return this.transporter;
  }

  async send(message: MailMessage): Promise<void> {
    try {
      await this.transport.sendMail({
        from: process.env.MAIL_FROM ?? 'BiblioApp <noreply@biblio.local>',
        ...message,
      });
    } catch (err) {
      // Mailfouten mogen een registratie of reset niet laten mislukken.
      this.logger.error(`Mail naar ${message.to} mislukt: ${(err as Error).message}`);
    }
  }
}
