import { IsString, IsNotEmpty, IsDateString, IsIn, IsOptional } from 'class-validator';
import type { PayFrequency } from '../../../database/database.service';

export class CreatePayRunDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsDateString()
  @IsNotEmpty()
  periodStart: string; // 'YYYY-MM-DD'

  @IsDateString()
  @IsNotEmpty()
  periodEnd: string; // 'YYYY-MM-DD'

  @IsDateString()
  @IsNotEmpty()
  paymentDate: string; // 'YYYY-MM-DD'

  @IsOptional()
  @IsIn(['weekly', 'bi_weekly', 'monthly'])
  frequency?: PayFrequency = 'monthly';

  @IsOptional()
  @IsString()
  notes?: string;
}
