import { Module } from '@nestjs/common';
import { BooksController } from './books/books.controller';
import { BooksService } from './books/books.service';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';

@Module({
  imports: [PrismaModule, AuditModule, MailModule, AuthModule],
  controllers: [HealthController, BooksController],
  providers: [BooksService],
})
export class AppModule {}
