import { IsOptional, IsString, IsEnum } from 'class-validator';

export class QueryLeaveRequestsDto {
  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsEnum(['all', 'pending', 'approved', 'rejected', 'cancelled'])
  status?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}
