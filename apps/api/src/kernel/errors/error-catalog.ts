import _ from "lodash";

import {
  DomainError,
  DomainErrorCategory,
} from "@/api/kernel/errors/domain-errors";

/** Catalog messages interpolate `{ param }`, not lodash's default delimiters. */
const TEMPLATE_SETTINGS = { interpolate: /{\s*([\s\S]+?)\s*}/g };

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
    const message = _.template(messageTemplate, TEMPLATE_SETTINGS)(params);
    const code = `${namespace}.${errorKey}`;
    return new DomainError(code, message, options);
  };

  return { catalog: { namespace, definitions }, createError };
}
