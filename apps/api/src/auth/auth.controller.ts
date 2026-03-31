import { All, Controller, Inject,Req, Res } from "@nestjs/common";
import { toNodeHandler } from "better-auth/node";
import { Request, Response } from "express";

import { Auth } from "@/api/auth/betterAuth";
import { BETTER_AUTH } from "@/api/auth/betterAuth.module";
import { Public } from "@/api/auth/public.decorator";

@Controller("api/auth")
export class AuthController {
  private handler: ReturnType<typeof toNodeHandler>;

  constructor(
    @Inject(BETTER_AUTH)
    auth: Auth,
  ) {
    this.handler = toNodeHandler(auth);
  }

  @Public()
  @All("*")
  async handleAuth(@Req() req: Request, @Res() res: Response) {
    return this.handler(req, res);
  }
}
