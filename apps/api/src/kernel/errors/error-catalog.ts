import _ from "node_modules/@types/lodash";

import { DomainError, DomainErrorCategory } from "./domain-errors";

export type NameSpaceKey = string;

export type ErrorKey = string;

export type ErrorDefinition = {
  category: DomainErrorCategory;
  message: string;
  exposable: boolean;
};

export type ErrorCatalog = {
  namespace: NameSpaceKey;
  definitions: Record<ErrorKey, ErrorDefinition>;
};

export function defineCatalog<D extends Record<ErrorKey, ErrorDefinition>>(
  namespace: NameSpaceKey,
  definitions: D,
) {
  const createError = (
    errorKey: keyof D & string,
    params: Record<string, unknown> = {},
    options?: ErrorOptions,
  ) => {
    const { message: messageTemplate } = definitions[errorKey];
    const message = _.template(messageTemplate)(params);
    const code = `${namespace}.${errorKey}`;
    return new DomainError(code, message, options);
  };

  return { catalog: { namespace, definitions }, createError };
}
