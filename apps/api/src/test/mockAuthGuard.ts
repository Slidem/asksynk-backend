import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { TEST_USER } from "@/api/test/testUser";

@Injectable()
export class MockAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    req.user = TEST_USER;
    return true;
  }
}
