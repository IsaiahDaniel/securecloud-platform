import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module.js";
import { DatabaseExceptionFilter } from "./common/exceptions/database-exception.filter.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new DatabaseExceptionFilter());

  const config = app.get(ConfigService);
  const port = config.getOrThrow<number>("PORT");
  const host = config.getOrThrow<string>("HOST");
  await app.listen(port, host);
  logger.log(`listening on http://${host}:${port}`);
}

void bootstrap();
