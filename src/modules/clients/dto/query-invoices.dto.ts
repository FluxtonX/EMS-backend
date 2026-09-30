import { IsOptional, IsString, IsIn, IsDateString } from 'class-validator';

export class QueryInvoicesDto {
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsIn(['all', 'draft', 'sent', 'paid', 'overdue', 'void'])
  status?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
