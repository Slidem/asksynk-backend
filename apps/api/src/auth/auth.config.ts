import { ConfigService } from "@nestjs/config";

export type AuthConfig = {
  issuer: string;
  audiences: string[];
  jwksUrl?: string;
};

export const getAuthConfig = (configService: ConfigService): AuthConfig => {
  const issuer = configService.getOrThrow<string>("KEYCLOAK_ISSUER");
  const audiencesRaw = configService.get<string>("KEYCLOAK_AUDIENCES") ?? "";
  const audiences = audiencesRaw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (audiences.length === 0) {
    throw new Error("KEYCLOAK_AUDIENCES is required");
  }

  return {
    issuer,
    audiences,
    jwksUrl: configService.get<string>("KEYCLOAK_JWKS_URL"),
  };
};
