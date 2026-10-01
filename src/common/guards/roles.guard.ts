import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role, normalizeRole } from '../enums/role.enum';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.role) {
      throw new ForbiddenException('User lacks required role credentials.');
    }

    const userRoleNormalized = normalizeRole(user.role);
    const hasRole = requiredRoles.some((r) => normalizeRole(r) === userRoleNormalized);
    if (!hasRole) {
      throw new ForbiddenException(
        `Action restricted. Requires one of roles: [${requiredRoles.join(', ')}]. Current role: ${user.role}`
      );
    }

    return true;
  }
}
