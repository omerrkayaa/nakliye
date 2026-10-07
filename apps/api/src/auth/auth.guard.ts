import {
  createParamDecorator,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { Role } from "@nakliye/shared";
import type { Request } from "express";
import type { AccessPayload } from "./auth.service.js";

const ROLES_KEY = "roles";
/** Uç noktayı belirli rollere kısıtlar (docs/04 §8 rol tabanlı yetki). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

type AuthedRequest = Request & { user?: AccessPayload };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const [scheme, token] = req.headers.authorization?.split(" ") ?? [];
    if (scheme !== "Bearer" || !token) throw new UnauthorizedException();

    try {
      req.user = await this.jwt.verifyAsync<AccessPayload>(token);
    } catch {
      throw new UnauthorizedException();
    }

    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (required && !required.some((r) => req.user!.roles.includes(r))) throw new ForbiddenException();
    return true;
  }
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthedRequest>().user!,
);
