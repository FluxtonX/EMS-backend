import { IsNotEmpty, IsUUID, IsNumber, IsOptional, IsDateString, Min, IsString } from 'class-validator';

export class TransferAssignmentDto {
  @IsNotEmpty({ message: 'Destination Site Job role is required.' })
  @IsUUID('4', { message: 'Valid destination site job UUID is required.' })
  newSiteJobId: string;

  @IsOptional()
  @IsNumber({}, { message: 'New agreed pay rate must be a valid number.' })
  @Min(0, { message: 'New agreed pay rate cannot be negative.' })
  newPayRate?: number;

  @IsNotEmpty({ message: 'Transfer effective date is required.' })
  @IsDateString({}, { message: 'Transfer date must be in YYYY-MM-DD format.' })
  transferDate: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class CloseAssignmentDto {
  @IsNotEmpty({ message: 'Closing end date is required.' })
  @IsDateString({}, { message: 'End date must be in YYYY-MM-DD format.' })
  endDate: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
