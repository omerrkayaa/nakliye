import {
  createParamDecorator,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { Role } from "@nakliye/shared";
import { eq } from "drizzle-orm";
import type { Request } from "express";
import { DB, type Db } from "../db/db.module.js";
import { users } from "../db/schema.js";
import { SUSPENDED_MESSAGE, type AccessPayload } from "./auth.service.js";

const ROLES_KEY = "roles";
/** Uç noktayı belirli rollere kısıtlar (docs/04 §8 rol tabanlı yetki). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

type AuthedRequest = Request & { user?: AccessPayload };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    @Inject(DB) private readonly db: Db,
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
    // Belirteç 15 dk geçerli; askıya alınan ya da silinen hesap o süreyi beklemeden durur (her istekte birincil anahtarla tek sorgu)
    const [u] = await this.db.select({ status: users.status }).from(users).where(eq(users.id, req.user.sub));
    if (!u || u.status === "silindi") throw new UnauthorizedException("Hesap bulunamadı");
    // FR-08: dondurulan hesap girişle açılır; 401 istemcileri giriş ekranına götürür
    if (u.status === "donduruldu") throw new UnauthorizedException("Hesabınız donduruldu; giriş yaparak açabilirsiniz.");
    if (u.status === "askida") throw new ForbiddenException(SUSPENDED_MESSAGE);

    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (required && !required.some((r) => req.user!.roles.includes(r))) throw new ForbiddenException();
    return true;
  }
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthedRequest>().user!,
);
