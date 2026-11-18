import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "@jest/globals";
import { ConfigService } from "@nestjs/config";
import { createLoggerParams } from "./logging.module.js";

describe("LoggingModule", () => {
  it("configures structured logging with service metadata and redaction", () => {
    const config = new ConfigService({
      LOG_LEVEL: "debug",
      NODE_ENV: "production",
    });

    const params = createLoggerParams(config);
    const pinoHttp = params.pinoHttp as Record<string, unknown>;

    expect(pinoHttp.level).toBe("debug");
    expect(pinoHttp.autoLogging).toBe(true);
    expect(pinoHttp.base).toEqual({
      service: "securecloud-api",
      env: "production",
    });
    expect(pinoHttp.redact).toEqual({
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        'res.headers["set-cookie"]',
      ],
      censor: "[REDACTED]",
    });
  });

  it("disables autoLogging when LOG_LEVEL is silent", () => {
    const config = new ConfigService({ LOG_LEVEL: "silent" });
    const params = createLoggerParams(config);
    const pinoHttp = params.pinoHttp as Record<string, unknown>;

    expect(pinoHttp.autoLogging).toBe(false);
  });

  it("reuses x-request-id header when present or generates a UUID", () => {
    const config = new ConfigService({});
    const params = createLoggerParams(config);
    const pinoHttp = params.pinoHttp as {
      genReqId: (req: IncomingMessage) => string;
    };

    const withHeader = {
      headers: { "x-request-id": "req-123" },
    } as unknown as IncomingMessage;
    expect(pinoHttp.genReqId(withHeader)).toBe("req-123");

    const withoutHeader = { headers: {} } as unknown as IncomingMessage;
    expect(pinoHttp.genReqId(withoutHeader)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});
