import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { MeService } from './me.service';
import { DatabaseModule } from '../../database/database.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { LeaveModule } from '../leave/leave.module';
import { LicencesModule } from '../licences/licences.module';
import { TimesheetsModule } from '../timesheets/timesheets.module';

@Module({
  imports: [DatabaseModule, AttendanceModule, LeaveModule, LicencesModule, TimesheetsModule],
  controllers: [MeController],
  providers: [MeService],
  exports: [MeService],
})
export class MeModule {}
