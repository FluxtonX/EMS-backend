import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Role } from '../../../common/enums/role.enum';

export class InviteTeamMemberDto {
  @IsEmail({}, { message: 'A valid email address is required' })
  email: string;

  @IsEnum(Role, { message: 'Role must be Owner, Manager, or Supervisor/Operator' })
  role: Role;

  @IsString()
  @IsOptional()
  name?: string;
}

export class UpdateMemberStatusDto {
  @IsString()
  @IsNotEmpty()
  status: 'active' | 'suspended';
}
