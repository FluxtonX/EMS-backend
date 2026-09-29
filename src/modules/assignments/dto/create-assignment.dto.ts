import { IsNotEmpty, IsUUID, IsNumber, IsOptional, IsDateString, Min } from 'class-validator';

export class CreateAssignmentDto {
  @IsNotEmpty({ message: 'Employee ID is required.' })
  @IsUUID('4', { message: 'Valid employee UUID is required.' })
  employeeId: string;

  @IsNotEmpty({ message: 'Site Job role is required.' })
  @IsUUID('4', { message: 'Valid site job UUID is required.' })
  siteJobId: string;

  @IsOptional()
  @IsNumber({}, { message: 'Pay rate must be a valid number.' })
  @Min(0, { message: 'Pay rate cannot be negative.' })
  payRate?: number;

  @IsNotEmpty({ message: 'Assignment start date is required.' })
  @IsDateString({}, { message: 'Start date must be in YYYY-MM-DD format.' })
  startDate: string;

  @IsOptional()
  @IsDateString({}, { message: 'End date must be in YYYY-MM-DD format.' })
  endDate?: string;
}
