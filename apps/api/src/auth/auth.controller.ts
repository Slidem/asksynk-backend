import { All, Controller, Req, Res, Inject } from "@nestjs/common";
import { Request, Response } from "express";
import { BETTER_AUTH } from "@/api/auth/betterAuth.module";
import { Auth } from "@/api/auth/betterAuth";
import { Public } from "@/api/auth/public.decorator";
import { toNodeHandler } from "better-auth/node";

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
