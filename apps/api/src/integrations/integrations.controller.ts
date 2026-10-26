import { Controller, Get, Post, UseGuards } from "@nestjs/common";
import { DevOnlyGuard } from "./dev-only.guard.js";
import { GarminService } from "./garmin.service.js";

@Controller("integrations")
export class IntegrationsController {
  constructor(private readonly garmin: GarminService) {}

  @Get("status")
  status() {
    return {
      garmin: { configured: this.garmin.isConfigured() },
    };
  }

  @Post("garmin/check")
  @UseGuards(DevOnlyGuard)
  checkGarmin() {
    return this.garmin.check();
  }
}
