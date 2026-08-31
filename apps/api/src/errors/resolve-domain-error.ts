import { ERROR_REGISTRY } from "@/api/errors/error-registry.root";
import {
  DomainError,
  DomainErrorCategory,
} from "@/api/kernel/errors/domain-errors";

const STATUS_BY_CATEGORY: Record<DomainErrorCategory, number> = {
  [DomainErrorCategory.INVALID_VALUE]: 400,
  [DomainErrorCategory.FORBIDDEN]: 403,
  [DomainErrorCategory.NOT_FOUND]: 404,
  [DomainErrorCategory.CONFLICT]: 409,
  [DomainErrorCategory.RULE_VIOLATION]: 422,
  [DomainErrorCategory.INTERNAL]: 500,
};

export type ResolvedDomainError = {
  category: DomainErrorCategory;
  statusCode: number;
  /** Safe to send to the client; generic unless the catalog marks it exposable. */
  message: string;
};

/**
 * Looks a thrown DomainError up in the registry. Fails closed: an unregistered
 * code is treated as INTERNAL with a generic message.
 */
export function resolveDomainError(error: DomainError): ResolvedDomainError {
  const definition = ERROR_REGISTRY.get(error.code);
  const category = definition?.category ?? DomainErrorCategory.INTERNAL;
  const exposable = definition?.exposable ?? false;

  return {
    category,
    statusCode: STATUS_BY_CATEGORY[category],
    message:
      exposable && error.message ? error.message : "A domain error occurred",
  };
}
