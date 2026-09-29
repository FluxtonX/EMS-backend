import { IsOptional, IsUUID, IsString, IsInt, Min, Matches, IsIn } from 'class-validator';
import type { ShiftStatus } from '../../../database/database.service';

export class UpdateShiftDto {
  @IsUUID()
  @IsOptional()
  employeeId?: string | null;

  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'shiftDate must be YYYY-MM-DD format' })
  shiftDate?: string;

  @IsString()
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'startTime must be HH:MM in 24h format' })
  startTime?: string;

  @IsString()
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'endTime must be HH:MM in 24h format' })
  endTime?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  breakMinutes?: number;

  @IsIn(['scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled'])
  @IsOptional()
  status?: ShiftStatus;

  @IsString()
  @IsOptional()
  notes?: string;
}
