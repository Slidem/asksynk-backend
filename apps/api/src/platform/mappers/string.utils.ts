import { clamp, toNumber } from "lodash";

export const toNonNegativeNumberOptional = (
  value?: string,
): number | undefined => {
  if (value === undefined) {
    return undefined;
  }
  return clamp(toNumber(value), 0, Number.POSITIVE_INFINITY);
};
