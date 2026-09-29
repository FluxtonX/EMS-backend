import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../../database/database.service';
import { getPermissionsForRole } from '../../../common/enums/permission.enum';
import { Role } from '../../../common/enums/role.enum';

export interface JwtPayload {
  sub: string;
  email: string;
  companyId: string;
  role: Role;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private db: DatabaseService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>(
        'jwt.secret',
        'production_grade_secret_key_minimum_32_characters_for_hmac_sha256'
      ),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.db.findUserById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User account not found or is deactivated.');
    }

    const membership = await this.db.findCompanyMember(payload.companyId, payload.sub);
    if (!membership || membership.status !== 'active') {
      throw new UnauthorizedException('Company membership is inactive or invalid.');
    }

    const permissions = getPermissionsForRole(membership.role);

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      companyId: payload.companyId,
      role: membership.role,
      permissions,
    };
  }
}
