import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class CreateLicenceDto {
  @IsNotEmpty()
  @IsString()
  licenceType: string;

  @IsNotEmpty()
  @IsString()
  licenceNumber: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'expiryDate must be in YYYY-MM-DD format' })
  expiryDate: string;
}
