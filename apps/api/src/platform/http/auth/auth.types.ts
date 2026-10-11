export type RequestHeaders = Record<string, string | string[] | undefined>;

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

export type AuthGuest = {
  id: string;
  publicViewId: string;
  ownerUserId: string;
  displayName: string;
  expiresAt: Date;
};

export type RequestWithUser = {
  user?: AuthUser;
  session?: AuthSession;
  headers?: {
    authorization?: string;
    [key: string]: string | string[] | undefined;
  };
};

export type RequestWithAuth = RequestWithUser & {
  guest?: AuthGuest;
};
