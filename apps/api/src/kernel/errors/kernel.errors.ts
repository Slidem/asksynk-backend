import { DomainErrorCategory } from "./domain-errors";
import { defineCatalog } from "./error-catalog";

const { catalog, createError } = defineCatalog("core", {
  invalid_value: {
    category: DomainErrorCategory.INVALID_VALUE,
    message: "{ message }",
    exposable: true,
  },
});

export const coreErrorsCatalog = catalog;

export const invalidValueError = (message: string, options?: ErrorOptions) =>
  createError("invalid_value", { message }, options);
