import { applyDecorators, UseGuards } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";

import { AdminApiKeyGuard } from "@/api/auth/admin-api-key.guard";
import { Public } from "@/api/auth/public.decorator";

/**
 * Admin-only controller: skips user auth, requires the admin API key, hidden
 * from Swagger. Bundled so `Public()` can't be applied without the key check.
 */
export const AdminApi = () =>
  applyDecorators(
    Public(),
    UseGuards(AdminApiKeyGuard),
    ApiExcludeController(),
  );
