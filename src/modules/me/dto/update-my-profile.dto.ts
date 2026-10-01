import { IsString, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateMyAddressDto {
  @IsString()
  @IsOptional()
  line1?: string;

  @IsString()
  @IsOptional()
  line2?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  postalCode?: string;

  @IsString()
  @IsOptional()
  country?: string;
}

export class UpdateMyEmergencyContactDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  relationship?: string;

  @IsString()
  @IsOptional()
  phone?: string;
}

export class UpdateMyProfileDto {
  @IsString()
  @IsOptional()
  phone?: string;

  @ValidateNested()
  @Type(() => UpdateMyAddressDto)
  @IsOptional()
  address?: UpdateMyAddressDto;

  @ValidateNested()
  @Type(() => UpdateMyEmergencyContactDto)
  @IsOptional()
  emergencyContact?: UpdateMyEmergencyContactDto;
}
