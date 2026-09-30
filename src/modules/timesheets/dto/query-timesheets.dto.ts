import { IsOptional, IsEnum, IsUUID, IsDateString } from 'class-validator';
import type { TimesheetStatus } from '../../../database/database.service';

export class QueryTimesheetsDto {
  @IsUUID()
  @IsOptional()
  employeeId?: string;

  @IsEnum(['draft', 'submitted', 'approved', 'locked', 'rejected', 'all'])
  @IsOptional()
  status?: TimesheetStatus | 'all';

  @IsDateString()
  @IsOptional()
  periodStart?: string;

  @IsDateString()
  @IsOptional()
  periodEnd?: string;
}
