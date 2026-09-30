import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { LeaveStatus } from '../../../database/database.service';

export class ReviewLeaveRequestDto {
  @IsEnum(['approved', 'rejected'])
  status: Extract<LeaveStatus, 'approved' | 'rejected'>;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewNotes?: string;
}
