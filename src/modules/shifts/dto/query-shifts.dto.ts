import { IsOptional, IsUUID, IsString, Matches, IsIn } from 'class-validator';
import { ShiftStatus } from '../../../database/database.service';

export class QueryShiftsDto {
  @IsUUID()
  @IsOptional()
  siteId?: string;

  @IsUUID()
  @IsOptional()
  employeeId?: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate must be YYYY-MM-DD' })
  startDate?: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'endDate must be YYYY-MM-DD' })
  endDate?: string;

  @IsIn(['scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'all'])
  @IsOptional()
  status?: ShiftStatus | 'all';
}

export class QueryEligibleEmployeesDto {
  @IsUUID()
  siteId: string;

  @IsUUID()
  siteJobId: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'shiftDate must be YYYY-MM-DD' })
  shiftDate: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'startTime must be HH:MM' })
  startTime: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'endTime must be HH:MM' })
  endTime: string;
}
