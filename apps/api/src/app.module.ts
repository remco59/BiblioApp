import { Module } from '@nestjs/common';
import { BooksController } from './catalog/books.controller';
import { BooksService } from './catalog/books.service';
import { ImportExportService } from './catalog/import-export.service';
import { IsbnService } from './catalog/isbn.service';
import { SearchService } from './catalog/search.service';
import { StaffCatalogController } from './catalog/staff.controller';
import { StorageService } from './catalog/storage.service';
import {
  AdminSettingsController,
  DeskController,
  MeController,
  RulesController,
} from './loans/loans.controller';
import { LoansService } from './loans/loans.service';
import { MembersService } from './loans/members.service';
import { SettingsService } from './loans/settings.service';
import { JobsModule } from './jobs/jobs.module';
import { EventsService } from './notifications/events.service';
import { NotificationsService } from './notifications/notifications.service';
import { MaintenanceService } from './reservations/maintenance.service';
import { ReservationsController } from './reservations/reservations.controller';
import { ReservationsService } from './reservations/reservations.service';
import { AdminController } from './admin/admin.controller';
import { AdminService } from './admin/admin.service';
import { CommunityController } from './community/community.controller';
import { CommunityService } from './community/community.service';
import { RecommendationsService } from './community/recommendations.service';
import { PaymentsController } from './payments/payments.controller';
import { PaymentsService } from './payments/payments.service';
import { ReportsController } from './reports/reports.controller';
import { ReportsService } from './reports/reports.service';
import { MetricsService } from './ops/metrics.service';
import { OpsController } from './ops/ops.controller';
import { PrivacyController } from './privacy/privacy.controller';
import { PrivacyService } from './privacy/privacy.service';
import { UsersController } from './users/users.controller';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';

@Module({
  imports: [PrismaModule, AuditModule, MailModule, JobsModule, AuthModule],
  controllers: [
    HealthController,
    BooksController,
    StaffCatalogController,
    DeskController,
    AdminSettingsController,
    RulesController,
    MeController,
    ReservationsController,
    CommunityController,
    ReportsController,
    AdminController,
    PaymentsController,
    OpsController,
    PrivacyController,
    UsersController,
  ],
  providers: [
    PrivacyService,
    MetricsService,
    CommunityService,
    RecommendationsService,
    ReportsService,
    AdminService,
    PaymentsService,
    EventsService,
    NotificationsService,
    ReservationsService,
    MaintenanceService,
    LoansService,
    MembersService,
    SettingsService,
    BooksService,
    SearchService,
    IsbnService,
    StorageService,
    ImportExportService,
  ],
})
export class AppModule {}
