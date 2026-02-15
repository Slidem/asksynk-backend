export type AuthUser = {
  id: string;
  email: string;
  name?: string;
  emailVerified?: boolean;
  image?: string;
};

export type AuthSession = {
  session: {
    id: string;
    userId: string;
    token: string;
    expiresAt: Date;
  };
  user: AuthUser;
};

export type RequestWithUser = {
  user?: AuthUser;
  session?: AuthSession;
  headers?: {
    authorization?: string;
    [key: string]: string | string[] | undefined;
  };
};
