import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify } from "jose";

import { ConfigService } from "@nestjs/config";
import { UsersService } from "@/api/services/users.service";
import { getAuthConfig } from "@/api/auth/auth.config";

type VerifiedToken = {
  sub?: string;
  iss?: string;
  aud?: string | string[];
  given_name?: string;
  family_name?: string;
  email?: string;
};

type AuthUser = {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};

@Injectable()
export class AuthService {
  private readonly jwksUrlOverride: string | undefined;
  private readonly issuer: string;
  private readonly audiences: string[];
  private remoteJwks?: ReturnType<typeof createRemoteJWKSet>;
  private discoveryJwksUrl?: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const authConfig = getAuthConfig(this.configService);
    this.jwksUrlOverride = authConfig.jwksUrl;
    this.issuer = authConfig.issuer;
    this.audiences = authConfig.audiences;
  }

  async verifyToken(authHeader?: string): Promise<AuthUser> {
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing auth token");
    }

    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) {
      throw new UnauthorizedException("Missing auth token");
    }

    const jwks = await this.getRemoteJwks();

    const { payload } = await jwtVerify<VerifiedToken>(token, jwks, {
      issuer: this.issuer,
      audience: this.audiences,
    });

    if (!payload.sub) {
      throw new UnauthorizedException("Missing subject");
    }

    const user = {
      id: payload.sub,
      firstName: payload.given_name,
      lastName: payload.family_name,
      email: payload.email,
    };

    await this.usersService.upsertUserFromAuth(user);

    return user;
  }

  private async getRemoteJwks() {
    if (this.remoteJwks) {
      return this.remoteJwks;
    }

    const jwksUrl = await this.getJwksUrl();
    this.remoteJwks = createRemoteJWKSet(new URL(jwksUrl));
    return this.remoteJwks;
  }

  private async getJwksUrl(): Promise<string> {
    if (this.jwksUrlOverride) {
      return this.jwksUrlOverride;
    }

    if (this.discoveryJwksUrl) {
      return this.discoveryJwksUrl;
    }

    const response = await fetch(
      `${this.issuer}/.well-known/openid-configuration`,
    );

    if (!response.ok) {
      throw new UnauthorizedException("Failed to load OIDC config");
    }

    const config = (await response.json()) as { jwks_uri?: string };
    if (!config.jwks_uri) {
      throw new UnauthorizedException("Missing JWKS URL");
    }

    this.discoveryJwksUrl = config.jwks_uri;
    return this.discoveryJwksUrl;
  }
}
