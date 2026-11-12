import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AccessRole } from '../../../shared/domain/models';
import { AuthService } from './auth.service';
import { AuthUser, SESSION_COOKIE } from './auth.types';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: AccessRole[]) => SetMetadata(ROLES_KEY, roles);
export const PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(PUBLIC_KEY, true);

export type AuthedRequest = Request & { authUser?: AuthUser };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = readSession(req);
    const user = await this.auth.userFromRequest(token);
    if (user) {
      req.authUser = user;
    }
    if (isPublic) {
      return true;
    }
    if (!user) {
      throw new UnauthorizedException('login required');
    }
    const roles = this.reflector.getAllAndOverride<AccessRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles && roles.length > 0 && !roles.includes(user.access)) {
      throw new ForbiddenException('insufficient role');
    }
    return true;
  }
}

export function readSession(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, string> | undefined;
  return cookies?.[SESSION_COOKIE];
}
