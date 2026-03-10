import { ulid, isValid } from "ulidx";

export function generateId(): string {
  return ulid();
}

export function isValidId(id: string): boolean {
  return isValid(id);
}
