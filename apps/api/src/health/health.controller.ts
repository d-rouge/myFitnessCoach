import { Controller, Get } from "@nestjs/common";
import { Public } from "../auth/public.decorator.js";
import { HealthService } from "./health.service.js";

@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @Public()
  check() {
    return this.health.check();
  }
}
