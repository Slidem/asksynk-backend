import { Controller, Get } from "@nestjs/common";

@Controller("tags")
export class TagsController {
  @Get()
  getTags() {
    return { ok: true };
  }
}
