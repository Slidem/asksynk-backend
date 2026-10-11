export type UserLookupRow = {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
};

export abstract class UsersLookupRepository {
  abstract getByEmail(email: string): Promise<UserLookupRow | null>;
  abstract getById(id: string): Promise<UserLookupRow | null>;
}
