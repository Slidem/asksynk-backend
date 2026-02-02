import { Controller, Get } from "@nestjs/common";

async function test() {
  return true;
}

@Controller("health")
export class HealthController {
  @Get()
  getHealth() {
    return { ok: true };
  }
}
