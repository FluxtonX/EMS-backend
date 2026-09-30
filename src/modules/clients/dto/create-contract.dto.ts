import { IsString, IsNotEmpty, IsDateString, IsOptional, IsNumber, IsIn, Min } from 'class-validator';

export class CreateContractDto {
  @IsString()
  @IsNotEmpty()
  clientId: string;

  @IsString()
  @IsNotEmpty()
  siteId: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  contractNumber: string;

  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsIn(['weekly', 'bi_weekly', 'monthly'])
  billingCycle?: 'weekly' | 'bi_weekly' | 'monthly' = 'monthly';

  @IsNumber()
  @Min(0)
  hourlyBillingRate: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
