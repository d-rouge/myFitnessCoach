import type { User } from "@health-trainer/domain";
import { createParamDecorator, type ExecutionContext, UnauthorizedException } from "@nestjs/common";
import type { AuthenticatedRequest } from "./auth.guard.js";

/**
 * Returns the user resolved by AuthGuard for the current request.
 * Use it instead of trusting headers such as x-user-id.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): User => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) {
      throw new UnauthorizedException("Authentication required");
    }
    return request.user;
  },
);
