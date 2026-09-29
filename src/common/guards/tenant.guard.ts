import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentication required.');
    }

    if (!user.companyId) {
      throw new ForbiddenException('User has no active company membership.');
    }

    // Security Rule: If payload or query specifies company_id, it MUST match user.companyId
    const targetCompanyId =
      request.params?.companyId ||
      request.query?.companyId ||
      request.body?.companyId;

    if (targetCompanyId && targetCompanyId !== user.companyId) {
      throw new ForbiddenException('Cross-company tenant access is strictly prohibited.');
    }

    // Attach companyId to request context
    request.companyId = user.companyId;

    return true;
  }
}
