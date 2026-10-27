import type { User } from "@health-trainer/domain";
import { type ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";
import { type AuthenticatedRequest, AuthGuard } from "./auth.guard.js";
import type { AuthService } from "./auth.service.js";
import { IS_PUBLIC_KEY } from "./public.decorator.js";

const user: User = {
  id: "personal",
  email: "runner@test.com",
  name: "Runner",
  roles: ["athlete"],
  createdAt: "2026-10-27T00:00:00.000Z",
  lastLoginAt: "2026-10-27T00:00:00.000Z",
};

function createContext(authorization?: string, isPublic = false) {
  const request = {
    headers: authorization ? { authorization } : {},
  } as unknown as AuthenticatedRequest;

  const handler = () => undefined;
  if (isPublic) {
    Reflect.defineMetadata(IS_PUBLIC_KEY, true, handler);
  }

  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => handler,
    getClass: () => class TestController {},
  } as unknown as ExecutionContext;

  return { context, request };
}

function createGuard(isValidToken: (token: string) => boolean) {
  const authService = {
    getUserFromToken: vi.fn(async (token: string) => (isValidToken(token) ? user : null)),
  } as unknown as AuthService;

  return {
    guard: new AuthGuard(authService, new Reflector()),
    authService,
  };
}

describe("AuthGuard", () => {
  it("allows public routes without a token", async () => {
    const { guard } = createGuard(() => false);
    const { context } = createContext(undefined, true);

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("rejects requests without an Authorization header", async () => {
    const { guard } = createGuard(() => true);
    const { context } = createContext();

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects invalid or expired tokens", async () => {
    const { guard } = createGuard(() => false);
    const { context } = createContext("Bearer bad-token");

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("attaches the resolved user to the request", async () => {
    const { guard } = createGuard((token) => token === "good-token");
    const { context, request } = createContext("Bearer good-token");

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual(user);
  });
});
