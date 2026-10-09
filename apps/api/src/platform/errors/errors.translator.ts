import {
  DomainError,
  DomainErrorCategory,
} from "@/api/kernel/errors/domain-errors";
import {
  ErrorCatalog,
  ErrorCode,
  ErrorDefinition,
  NameSpaceKey,
} from "@/api/kernel/errors/error-catalog";

const STATUS_BY_CATEGORY: Record<DomainErrorCategory, number> = {
  [DomainErrorCategory.INVALID_VALUE]: 400,
  [DomainErrorCategory.FORBIDDEN]: 403,
  [DomainErrorCategory.NOT_FOUND]: 404,
  [DomainErrorCategory.CONFLICT]: 409,
  [DomainErrorCategory.RULE_VIOLATION]: 422,
  [DomainErrorCategory.INTERNAL]: 500,
};

export type TranslatedDomainError = {
  category: DomainErrorCategory;
  statusCode: number;
  /** Safe to send to the client; generic unless the catalog marks it exposable. */
  message: string;
};

/**
 * Translates a thrown DomainError using the catalogs it was built with. Fails
 * closed: an unregistered code is treated as INTERNAL with a generic message.
 */
export class DomainErrorsTranslator {
  private readonly registry: ReadonlyMap<ErrorCode, ErrorDefinition>;

  constructor(catalogs: ErrorCatalog[]) {
    this.registry = this.buildRegistry(catalogs);
  }

  translate(error: DomainError): TranslatedDomainError {
    const definition = this.registry.get(error.code);
    const category = definition?.category ?? DomainErrorCategory.INTERNAL;
    const exposable = definition?.exposable ?? false;

    return {
      category,
      statusCode: STATUS_BY_CATEGORY[category],
      message:
        exposable && error.message ? error.message : "A domain error occurred",
    };
  }

  private buildRegistry(catalogs: ErrorCatalog[]) {
    const registry = new Map<ErrorCode, ErrorDefinition>();
    const seenNamespaces = new Set<NameSpaceKey>();

    for (const { namespace, definitions } of catalogs) {
      if (seenNamespaces.has(namespace)) {
        throw new Error(`Duplicate namespace detected: ${namespace}`);
      }

      seenNamespaces.add(namespace);

      for (const [key, definition] of Object.entries(definitions)) {
        const errorCode = `${namespace}.${key}`;
        if (registry.has(errorCode)) {
          throw new Error(`Duplicate error code detected: ${errorCode}`);
        }
        registry.set(errorCode, definition);
      }
    }

    return registry;
  }
}
