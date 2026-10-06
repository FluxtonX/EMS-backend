import { IsString, IsDateString, IsOptional, IsNumber, IsIn, Min } from 'class-validator';

export class UpdateContractDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  contractNumber?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsIn(['weekly', 'bi_weekly', 'monthly'])
  billingCycle?: 'weekly' | 'bi_weekly' | 'monthly';

  @IsOptional()
  @IsNumber()
  @Min(0)
  hourlyBillingRate?: number;

  @IsOptional()
  @IsIn(['active', 'expired', 'terminated'])
  status?: 'active' | 'expired' | 'terminated';

  @IsOptional()
  @IsString()
  notes?: string;
}
