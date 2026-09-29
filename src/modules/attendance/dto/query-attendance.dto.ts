import { IsOptional, IsUUID, IsString, Matches, IsIn } from 'class-validator';
import type { AttendanceStatus, VarianceFlag } from '../../../database/database.service';

export class QueryAttendanceDto {
  @IsUUID()
  @IsOptional()
  employeeId?: string;

  @IsUUID()
  @IsOptional()
  siteId?: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate must be YYYY-MM-DD' })
  startDate?: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'endDate must be YYYY-MM-DD' })
  endDate?: string;

  @IsIn(['clocked_in', 'on_break', 'clocked_out', 'reconciled', 'flagged', 'rejected', 'all'])
  @IsOptional()
  status?: AttendanceStatus | 'all';

  @IsIn(['none', 'late_arrival', 'early_departure', 'out_of_geofence', 'overtime', 'unmatched_shift', 'all'])
  @IsOptional()
  varianceFlag?: VarianceFlag | 'all';
}
