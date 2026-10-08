import { Module } from '@nestjs/common';
import { BooksController } from './catalog/books.controller';
import { BooksService } from './catalog/books.service';
import { ImportExportService } from './catalog/import-export.service';
import { IsbnService } from './catalog/isbn.service';
import { SearchService } from './catalog/search.service';
import { StaffCatalogController } from './catalog/staff.controller';
import { StorageService } from './catalog/storage.service';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';

@Module({
  imports: [PrismaModule, AuditModule, MailModule, AuthModule],
  controllers: [HealthController, BooksController, StaffCatalogController],
  providers: [BooksService, SearchService, IsbnService, StorageService, ImportExportService],
})
export class AppModule {}
