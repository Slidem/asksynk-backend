import {
  ErrorCatalog,
  ErrorDefinition,
  NameSpaceKey,
} from "@/api/kernel/errors/error-catalog";

// full error key is in the format of "namespace.key"
type ErrorCode = string;

export function buildErrorRegistry(catalogs: ErrorCatalog[]) {
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
