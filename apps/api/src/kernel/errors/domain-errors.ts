export enum DomainErrorCategory {
  NOT_FOUND = "NOT_FOUND",
  FORBIDDEN = "FORBIDDEN",
  CONFLICT = "CONFLICT",
  RULE_VIOLATION = "RULE_VIOLATION",
  INTERNAL = "INTERNAL",
}

export class DomainError extends Error {
  constructor(
    readonly category: DomainErrorCategory,
    readonly code: string,
    readonly params: Record<string, unknown> = {},
    message?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "DomainError";
  }
}
