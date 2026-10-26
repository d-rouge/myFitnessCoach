import type { Env } from "@health-trainer/config";
import { connectMongo, ensureIndexes, type MongoConnection } from "@health-trainer/db";
import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import type { Db } from "mongodb";
import { APP_ENV } from "../config/env.module.js";

@Injectable()
export class MongoService implements OnModuleDestroy {
  private connection?: MongoConnection;
  private indexesReady = false;

  constructor(@Inject(APP_ENV) private readonly env: Env) {}

  async getDb(): Promise<Db> {
    if (!this.connection) {
      this.connection = await connectMongo(this.env.MONGODB_URI);
    }

    if (!this.indexesReady) {
      await ensureIndexes(this.connection.db);
      this.indexesReady = true;
    }

    return this.connection.db;
  }

  async onModuleDestroy(): Promise<void> {
    await this.connection?.client.close();
  }
}
