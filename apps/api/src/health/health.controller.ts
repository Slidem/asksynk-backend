import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { Public } from "@/api/platform/http/auth/public.decorator";

@ApiTags("Health")
@Controller("health")
export class HealthController {
  /** Liveness/health check */
  @Get()
  @Public()
  getHealth() {
    return { ok: true };
  }
}
