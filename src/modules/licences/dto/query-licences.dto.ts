import { IsOptional, IsString, IsIn, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryLicencesDto {
  @IsOptional()
  @IsIn(['valid', 'expiring_soon', 'expired', 'pending_verification', 'rejected', 'all'])
  status?: 'valid' | 'expiring_soon' | 'expired' | 'pending_verification' | 'rejected' | 'all';

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
