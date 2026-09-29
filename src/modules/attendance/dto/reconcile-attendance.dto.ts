import { IsNotEmpty, IsString, IsNumber, IsOptional, Min, IsIn } from 'class-validator';
import type { AttendanceStatus, VarianceFlag } from '../../../database/database.service';

export class ReconcileAttendanceDto {
  @IsNumber()
  @Min(0)
  @IsOptional()
  adjustedTotalHours?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  adjustedBreakMinutes?: number;

  @IsIn(['reconciled', 'flagged', 'rejected'])
  @IsNotEmpty()
  status: AttendanceStatus;

  @IsIn(['none', 'late_arrival', 'early_departure', 'out_of_geofence', 'overtime', 'unmatched_shift'])
  @IsOptional()
  varianceFlag?: VarianceFlag;

  @IsString()
  @IsNotEmpty()
  supervisorNotes: string; // Mandatory explanation for supervisor override
}
