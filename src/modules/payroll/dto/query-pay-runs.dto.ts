import { IsOptional, IsString, IsIn, IsDateString } from 'class-validator';

export class QueryPayRunsDto {
  @IsOptional()
  @IsIn(['all', 'draft', 'pending_approval', 'approved', 'paid', 'cancelled'])
  status?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
