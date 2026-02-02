import { Controller, Get } from "@nestjs/common";

import { dummyMessage } from "@/shared/dummy";

@Controller("dummy")
export class DummyController {
  @Get()
  getDummy() {
    return { message: dummyMessage() };
  }
}
