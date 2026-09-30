import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewTimesheetDto {
  @IsEnum(['approved', 'rejected', 'locked'])
  status: 'approved' | 'rejected' | 'locked';

  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;
}
