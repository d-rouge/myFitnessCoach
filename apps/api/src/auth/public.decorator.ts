import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "health-trainer:isPublic";

/**
 * Marks a route as reachable without a bearer token.
 * Everything else is protected by the global AuthGuard.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
