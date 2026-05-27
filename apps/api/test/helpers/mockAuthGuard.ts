import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";

import { testUserRegistry } from "@/test/helpers/testUserRegistry";

@Injectable()
export class MockAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    req.user = testUserRegistry.resolve(req.headers["x-test-user-id"]);
    return true;
  }
}
