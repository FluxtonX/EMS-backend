import { IsString, IsNotEmpty, IsIn, IsOptional } from 'class-validator';
import type { PayRunStatus } from '../../../database/database.service';

export class ReviewPayRunDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['pending_approval', 'approved', 'paid', 'cancelled'])
  status: PayRunStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
