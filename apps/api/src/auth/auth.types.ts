export type AuthUser = {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};

export type RequestWithUser = {
  user?: AuthUser;
  headers?: {
    authorization?: string;
  };
};
