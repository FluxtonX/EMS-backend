import { IsOptional, IsString, Matches, IsIn } from 'class-validator';

export class UpdateLicenceDto {
  @IsOptional()
  @IsString()
  licenceType?: string;

  @IsOptional()
  @IsString()
  licenceNumber?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'expiryDate must be in YYYY-MM-DD format' })
  expiryDate?: string;

  @IsOptional()
  @IsIn(['valid', 'expiring_soon', 'expired', 'pending_verification', 'rejected'])
  status?: 'valid' | 'expiring_soon' | 'expired' | 'pending_verification' | 'rejected';
}
