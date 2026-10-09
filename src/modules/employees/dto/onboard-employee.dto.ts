import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AddressDto, EmergencyContactDto, InitialLicenceDto, EmploymentStatusEnum } from './create-employee.dto';

export class InitialAssignmentDto {
  @IsString()
  @IsNotEmpty({ message: 'Site Job role is required for initial assignment' })
  siteJobId: string;

  @IsNumber()
  @IsOptional()
  payRate?: number;

  @IsString()
  @IsOptional()
  startDate?: string;
}

export class OnboardEmployeeDto {
  @IsString()
  @IsOptional()
  employeeNumber?: string;

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
  employmentType?: string;

  @IsString()
  @IsOptional()
  positionTitle?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => InitialAssignmentDto)
  initialAssignment?: InitialAssignmentDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => InitialLicenceDto)
  initialLicence?: InitialLicenceDto;

  @IsString()
  @IsOptional()
  password?: string;

  @IsBoolean()
  @IsOptional()
  sendInvitation?: boolean = true;
}

