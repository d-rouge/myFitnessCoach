import type { Env } from "@health-trainer/config";
import { pingMongo } from "@health-trainer/db";
import { Inject, Injectable } from "@nestjs/common";
import { APP_ENV } from "../config/env.module.js";
import { buildHealthReport, type HealthReport } from "./health.report.js";

const VERSION = "0.1.0";

@Injectable()
export class HealthService {
  constructor(@Inject(APP_ENV) private readonly env: Env) {}

  async check(): Promise<HealthReport> {
    const mongo = await pingMongo(this.env.MONGODB_URI);

    return buildHealthReport({
      env: this.env,
      mongo,
      uptimeSec: Math.round(process.uptime()),
      version: VERSION,
    });
  }
}
