import { IsNotEmpty, IsString, IsIn, IsOptional } from 'class-validator';

export class RegisterDeviceDto {
  @IsIn(['web', 'android', 'ios'])
  @IsNotEmpty()
  deviceType: 'web' | 'android' | 'ios';

  @IsString()
  @IsOptional()
  platform?: string;

  @IsString()
  @IsNotEmpty()
  pushToken: string;
}
