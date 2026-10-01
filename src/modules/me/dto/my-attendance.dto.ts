import { IsOptional, IsUUID, IsNumber, Min, Max, IsString } from 'class-validator';

export class MyClockInDto {
  @IsUUID()
  @IsOptional()
  siteId?: string;

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

  @IsString()
  @IsOptional()
  notes?: string;
}

export class MyClockOutDto {
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
  accuracy?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
