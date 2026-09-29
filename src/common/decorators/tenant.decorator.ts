import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';

export const TenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.companyId) {
      throw new UnauthorizedException('Tenant context not established or user not authenticated.');
    }

    return user.companyId;
  }
);
