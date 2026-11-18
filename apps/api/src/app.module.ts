import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { CommonModule } from "./common/common.module.js";
import { validateEnv } from "./common/config/env.validation.js";
import { DocumentsModule } from "./modules/documents/documents.module.js";
import { HealthModule } from "./modules/health/health.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    CommonModule,
    HealthModule,
    DocumentsModule,
  ],
})
export class AppModule {}
