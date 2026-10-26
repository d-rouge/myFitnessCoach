import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module.js";
import { ExportController } from "./export.controller.js";

@Module({
  imports: [DatabaseModule],
  controllers: [ExportController],
})
export class ExportModule {}
