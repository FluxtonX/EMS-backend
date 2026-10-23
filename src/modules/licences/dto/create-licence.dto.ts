import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateLicenceDto {
  @IsNotEmpty()
  @IsString()
  licenceType: string;

  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value))
  @Matches(/^\d{16}$/, { message: 'SIA licenceNumber must be exactly 16 digits' })
  licenceNumber: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'expiryDate must be in YYYY-MM-DD format' })
  expiryDate: string;

  @IsOptional()
  @IsString()
  documentUrl?: string;
}
