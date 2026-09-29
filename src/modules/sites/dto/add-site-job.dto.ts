import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AddSiteJobDto {
  @IsString()
  @IsNotEmpty({ message: 'Job Type ID is required' })
  jobTypeId: string;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Default pay rate must be a valid number' })
  @Min(0, { message: 'Pay rate cannot be negative' })
  @Type(() => Number)
  defaultPayRate: number;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Billing rate must be a valid number' })
  @Min(0, { message: 'Billing rate cannot be negative' })
  @Type(() => Number)
  billingRate: number;

  @IsString()
  @IsOptional()
  currency?: string = 'GBP';
}

export class UpdateSiteJobDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  @IsOptional()
  defaultPayRate?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  @IsOptional()
  billingRate?: number;

  @IsString()
  @IsOptional()
  status?: 'active' | 'inactive';
}
