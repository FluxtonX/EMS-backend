import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AddressDto {
  @IsString()
  @IsNotEmpty({ message: 'Address line 1 is required' })
  line1: string;

  @IsString()
  @IsOptional()
  line2?: string;

  @IsString()
  @IsNotEmpty({ message: 'City is required' })
  city: string;

  @IsString()
  @IsNotEmpty({ message: 'Postal code is required' })
  postalCode: string;

  @IsString()
  @IsNotEmpty({ message: 'Country is required' })
  country: string;
}

export class EmergencyContactDto {
  @IsString()
  @IsNotEmpty({ message: 'Emergency contact name is required' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'Emergency contact relationship is required' })
  relationship: string;

  @IsString()
  @IsNotEmpty({ message: 'Emergency contact phone number is required' })
  phone: string;
}

export class InitialLicenceDto {
  @IsString()
  @IsNotEmpty({ message: 'Licence type is required' })
  licenceType: string;

  @IsString()
  @IsNotEmpty({ message: 'Licence number is required' })
  @Matches(/^\d{16}$/, { message: 'SIA licenceNumber must be exactly 16 digits' })
  licenceNumber: string;

  @IsString()
  @IsNotEmpty({ message: 'Expiry date is required' })
  expiryDate: string;
}

export enum EmploymentStatusEnum {
  ACTIVE = 'active',
  PROBATION = 'probation',
  SUSPENDED = 'suspended',
  TERMINATED = 'terminated',
  ON_LEAVE = 'on_leave',
}

export class CreateEmployeeDto {
  @IsString()
  @IsNotEmpty({ message: 'Employee ID number is required' })
  employeeNumber: string;

  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  firstName: string;

  @IsString()
  @IsNotEmpty({ message: 'Last name is required' })
  lastName: string;

  @IsEmail({}, { message: 'A valid email address is required' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'Phone number is required' })
  phone: string;

  @IsString()
  @IsNotEmpty({ message: 'Date of birth is required (YYYY-MM-DD)' })
  dateOfBirth: string;

  @IsObject()
  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto;

  @IsObject()
  @ValidateNested()
  @Type(() => EmergencyContactDto)
  emergencyContact: EmergencyContactDto;

  @IsEnum(EmploymentStatusEnum, {
    message: 'Status must be active, probation, suspended, terminated, or on_leave',
  })
  @IsOptional()
  employmentStatus?: EmploymentStatusEnum = EmploymentStatusEnum.ACTIVE;

  @IsString()
  @IsNotEmpty({ message: 'Employment start date is required' })
  employmentStartDate: string;

  @IsString()
  @IsOptional()
  password?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => InitialLicenceDto)
  initialLicence?: InitialLicenceDto;
}

