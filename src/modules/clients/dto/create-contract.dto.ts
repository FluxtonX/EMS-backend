import { IsString, IsNotEmpty, IsDateString, IsOptional, IsNumber, IsIn, Min } from 'class-validator';

export class CreateContractDto {
  @IsString()
  @IsNotEmpty()
  clientId: string;

  @IsOptional()
  @IsString()
  siteId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  contractNumber?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsIn(['weekly', 'bi_weekly', 'monthly'])
  billingCycle?: 'weekly' | 'bi_weekly' | 'monthly' = 'monthly';

  @IsOptional()
  @IsNumber()
  @Min(0)
  hourlyBillingRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  billingRatePerHour?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

