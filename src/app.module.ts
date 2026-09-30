import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import configuration from './config/configuration';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './modules/health/health.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { SitesModule } from './modules/sites/sites.module';
import { AssignmentsModule } from './modules/assignments/assignments.module';
import { ShiftsModule } from './modules/shifts/shifts.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { LicencesModule } from './modules/licences/licences.module';
import { LeaveModule } from './modules/leave/leave.module';
import { AvailabilityModule } from './modules/availability/availability.module';
import { ReportsModule } from './modules/reports/reports.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { TimesheetsModule } from './modules/timesheets/timesheets.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { ClientsModule } from './modules/clients/clients.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('throttle.ttl', 60),
          limit: config.get<number>('throttle.limit', 100),
        },
      ],
    }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    CompaniesModule,
    EmployeesModule,
    SitesModule,
    AssignmentsModule,
    ShiftsModule,
    AttendanceModule,
    DocumentsModule,
    LicencesModule,
    LeaveModule,
    AvailabilityModule,
    ReportsModule,
    NotificationsModule,
    TimesheetsModule,
    PayrollModule,
    ClientsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
