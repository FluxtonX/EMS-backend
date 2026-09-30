import { IsOptional, IsString, IsIn } from 'class-validator';

export class QueryPayslipsDto {
  @IsOptional()
  @IsString()
  payRunId?: string;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsIn(['all', 'draft', 'published', 'paid'])
  status?: string;
}
