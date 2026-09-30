import { IsNotEmpty, IsIn } from 'class-validator';

export class VerifyLicenceDto {
  @IsNotEmpty()
  @IsIn(['valid', 'rejected', 'expiring_soon', 'expired'])
  status: 'valid' | 'rejected' | 'expiring_soon' | 'expired';
}
