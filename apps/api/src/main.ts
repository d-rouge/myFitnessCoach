import "dotenv/config";
import "reflect-metadata";
import { loadEnv } from "@health-trainer/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  app.setGlobalPrefix("api");
  app.enableCors({
    origin: env.WEB_ORIGIN.split(",").map((origin) => origin.trim()),
    credentials: true,
  });
  app.enableShutdownHooks();

  await app.listen(env.API_PORT);

  console.log(`health-trainer API listening on http://localhost:${env.API_PORT}/api`);
}

void bootstrap();
