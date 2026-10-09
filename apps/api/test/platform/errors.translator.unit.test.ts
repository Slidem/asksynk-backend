import {
  DomainError,
  DomainErrorCategory,
} from "@/api/kernel/errors/domain-errors";
import { defineCatalog } from "@/api/kernel/errors/error-catalog";
import { DomainErrorsTranslator } from "@/api/platform/errors/errors.translator";

const GENERIC_MESSAGE = "A domain error occurred";

const { catalog, createError } = defineCatalog("t", {
  gone: {
    category: DomainErrorCategory.NOT_FOUND,
    message: "thing { id } not found",
    exposable: true,
  },
  boom: {
    category: DomainErrorCategory.CONFLICT,
    message: "secret",
    exposable: false,
  },
});

describe("DomainErrorsTranslator", () => {
  const translator = new DomainErrorsTranslator([catalog]);

  it("maps the category to a status and exposes the message when exposable", () => {
    expect(translator.translate(createError("gone", { id: 1 }))).toEqual({
      category: DomainErrorCategory.NOT_FOUND,
      statusCode: 404,
      message: "thing 1 not found",
    });
  });

  it("hides the message when not exposable", () => {
    expect(translator.translate(createError("boom"))).toEqual({
      category: DomainErrorCategory.CONFLICT,
      statusCode: 409,
      message: GENERIC_MESSAGE,
    });
  });

  it("fails closed on an unregistered code", () => {
    expect(translator.translate(new DomainError("nope.nope", "leak"))).toEqual(
      {
        category: DomainErrorCategory.INTERNAL,
        statusCode: 500,
        message: GENERIC_MESSAGE,
      },
    );
  });

  it.each([
    [DomainErrorCategory.INVALID_VALUE, 400],
    [DomainErrorCategory.FORBIDDEN, 403],
    [DomainErrorCategory.NOT_FOUND, 404],
    [DomainErrorCategory.CONFLICT, 409],
    [DomainErrorCategory.RULE_VIOLATION, 422],
    [DomainErrorCategory.INTERNAL, 500],
  ])("maps %s to %i", (category, statusCode) => {
    const { catalog: c } = defineCatalog("c", {
      e: { category, message: "m", exposable: true },
    });

    expect(
      new DomainErrorsTranslator([c]).translate(new DomainError("c.e", "m"))
        .statusCode,
    ).toBe(statusCode);
  });

  it("throws on a duplicate namespace", () => {
    expect(() => new DomainErrorsTranslator([catalog, catalog])).toThrow(
      "Duplicate namespace detected: t",
    );
  });
});
