import "dotenv/config";
import "reflect-metadata";
import { loadEnv } from "@health-trainer/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    bufferLogs: false,
  });

  // FIT uploads are sent as base64 JSON, which adds ~33% overhead.
  app.useBodyParser("json", { limit: "15mb" });
  app.useBodyParser("urlencoded", { limit: "15mb", extended: true });

  app.setGlobalPrefix("api");
  app.enableCors({
    origin: env.WEB_ORIGIN.split(",").map((origin) => origin.trim()),
    credentials: true,
  });
  app.enableShutdownHooks();

  if (env.ENABLE_DEV_ENDPOINTS) {
    console.warn("[auth] ENABLE_DEV_ENDPOINTS=true: dev login is active");
  }

  await app.listen(env.API_PORT);

  console.log(`health-trainer API listening on http://localhost:${env.API_PORT}/api`);
}

void bootstrap();
