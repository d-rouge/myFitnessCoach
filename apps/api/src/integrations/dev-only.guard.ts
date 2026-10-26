import type { Env } from "@health-trainer/config";
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { APP_ENV } from "../config/env.module.js";

@Injectable()
export class DevOnlyGuard implements CanActivate {
  constructor(@Inject(APP_ENV) private readonly env: Env) {}

  canActivate(_context: ExecutionContext): boolean {
    if (!this.env.ENABLE_DEV_ENDPOINTS) {
      throw new NotFoundException();
    }
    return true;
  }
}
