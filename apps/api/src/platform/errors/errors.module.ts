import { DynamicModule, Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";

import { ErrorCatalog } from "@/api/kernel/errors/error-catalog";
import { AllExceptionsFilter } from "@/api/platform/errors/errors.filter";
import { DomainErrorsTranslator } from "@/api/platform/errors/errors.translator";

@Module({})
export class ErrorsModule {
  static forRoot(errorCatalogues: ErrorCatalog[]): DynamicModule {
    return {
      module: ErrorsModule,
      global: true,
      providers: [
        {
          provide: DomainErrorsTranslator,
          useValue: new DomainErrorsTranslator(errorCatalogues),
        },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
      exports: [DomainErrorsTranslator],
    };
  }
}
