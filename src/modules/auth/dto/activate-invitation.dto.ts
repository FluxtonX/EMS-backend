import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class ActivateInvitationDto {
  @IsString()
  @IsNotEmpty({ message: 'Invitation token is required' })
  token: string;

  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  firstName: string;

  @IsString()
  @IsNotEmpty({ message: 'Last name is required' })
  lastName: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password: string;

  @IsString()
  @IsOptional()
  phone?: string;
}
