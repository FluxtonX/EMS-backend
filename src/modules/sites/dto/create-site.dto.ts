import { IsEmail, IsNotEmpty, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AddressDto } from '../../employees/dto/create-employee.dto';

export class CreateSiteDto {
  @IsString()
  @IsNotEmpty({ message: 'Site name is required' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'Site code is required (e.g. CW-01)' })
  code: string;

  @IsObject()
  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto;

  @IsString()
  @IsOptional()
  contactName?: string;

  @IsString()
  @IsOptional()
  contactPhone?: string;

  @IsEmail({}, { message: 'Must be a valid contact email' })
  @IsOptional()
  contactEmail?: string;
}
