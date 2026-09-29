import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateJobTypeDto {
  @IsString()
  @IsNotEmpty({ message: 'Job role name is required (e.g. Security Guard)' })
  name: string;

  @IsString()
  @IsOptional()
  description?: string;
}
