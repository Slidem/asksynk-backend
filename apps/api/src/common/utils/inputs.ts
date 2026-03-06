import { clamp, split, toNumber } from "lodash";

export const toOptionalBoolean = (value?: string): boolean | undefined => {
  if (value === undefined) {
    return undefined;
  }
  return value === "true";
};

export const toNonNegativeNumberOptional = (
  value?: string,
): number | undefined => {
  if (value === undefined) {
    return undefined;
  }
  return clamp(toNumber(value), 0, Number.POSITIVE_INFINITY);
};

export const toOptionalDate = (value?: string): Date | undefined =>
  value ? new Date(value) : undefined;

export const toOptionalStringArray = (
  value?: string,
  separator = ",",
): string[] | undefined => {
  if (!value) {
    return undefined;
  }
  return split(value, separator);
};
