import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { LoggerModule, type Params } from "nestjs-pino";

export function createLoggerParams(config: ConfigService): Params {
  const level = config.get<string>("LOG_LEVEL", "info");
  const env = config.get<string>("NODE_ENV", "development");

  return {
    pinoHttp: {
      level,
      autoLogging: level !== "silent",
      base: {
        service: "securecloud-api",
        env,
      },
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          'res.headers["set-cookie"]',
        ],
        censor: "[REDACTED]",
      },
      genReqId: (req: IncomingMessage) => {
        const header = req.headers["x-request-id"];
        if (typeof header === "string" && header.trim().length > 0) {
          return header.trim();
        }
        return randomUUID();
      },
    },
  };
}

@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: createLoggerParams,
    }),
  ],
  exports: [LoggerModule],
})
export class LoggingModule {}
