import {
  DomainError,
  DomainErrorCategory,
} from "@/api/kernel/errors/domain-errors";
import { defineCatalog } from "@/api/kernel/errors/error-catalog";

const { catalog, createError } = defineCatalog("core", {
  invalid_value: {
    category: DomainErrorCategory.INVALID_VALUE,
    message: "{ message }",
    exposable: true,
  },
  concurrency_conflict: {
    category: DomainErrorCategory.CONFLICT,
    message: "Resource was modified concurrently, retry",
    exposable: true,
  },
});

export const coreErrorsCatalog = catalog;

export const invalidValueError = (message: string, options?: ErrorOptions) =>
  createError("invalid_value", { message }, options);

export const concurrencyConflictError = () =>
  createError("concurrency_conflict");

export const isConcurrencyConflict = (e: unknown): boolean =>
  e instanceof DomainError && e.code === "core.concurrency_conflict";
