import { IsEmail, IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { Role } from '../../../common/enums/role.enum';

export class AddMemberDto {
  @IsEmail({}, { message: 'A valid user email is required' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  firstName: string;

  @IsString()
  @IsNotEmpty({ message: 'Last name is required' })
  lastName: string;

  @IsEnum(Role, { message: 'Role must be Owner, Admin, Manager, Supervisor, or Employee' })
  role: Role;
}
