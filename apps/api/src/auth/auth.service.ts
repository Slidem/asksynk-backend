import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";

import { AuthSession } from "./auth.types";
import { Auth } from "./betterAuth";
import { BETTER_AUTH } from "./betterAuth.module";

@Injectable()
export class AuthService {
  constructor(
    @Inject(BETTER_AUTH)
    private readonly auth: Auth,
  ) {}

  async validateRequest(
    headers: Record<string, string | string[] | undefined>,
  ): Promise<AuthSession> {
    const headersObj = new Headers(
      Object.entries(headers)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : (v as string)]),
    );

    const session = await this.auth.api.getSession({
      headers: headersObj,
    });

    if (!session) {
      throw new UnauthorizedException("Invalid or expired session");
    }

    return {
      session: {
        id: session.session.id,
        userId: session.session.userId,
        token: session.session.token,
        expiresAt: session.session.expiresAt,
      },
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name ?? undefined,
        emailVerified: session.user.emailVerified,
        image: session.user.image ?? undefined,
      },
    };
  }
}
