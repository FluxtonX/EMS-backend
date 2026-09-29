import { IsNotEmpty, IsUUID, IsNumber, IsOptional, Min, Max } from 'class-validator';

export class ClockInDto {
  @IsUUID()
  @IsNotEmpty()
  employeeId: string;

  @IsUUID()
  @IsNotEmpty()
  siteId: string;

  @IsUUID()
  @IsOptional()
  shiftId?: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  @IsOptional()
  longitude?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  accuracy?: number; // GPS accuracy in meters
}
