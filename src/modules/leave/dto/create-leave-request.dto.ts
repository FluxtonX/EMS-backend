import { IsEnum, IsString, IsDateString, IsOptional, IsUUID, MaxLength } from 'class-validator';
import type { LeaveType } from '../../../database/database.service';

export class CreateLeaveRequestDto {
  @IsUUID()
  employeeId: string;

  @IsEnum(['annual', 'sick', 'emergency', 'unpaid', 'other'])
  leaveType: LeaveType;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
