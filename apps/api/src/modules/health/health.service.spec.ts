import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { ServiceUnavailableException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { DataSource } from "typeorm";
import { HealthService } from "./health.service.js";

describe("HealthService", () => {
  const dataSource = {
    query: jest.fn((..._args: unknown[]): unknown => undefined),
  };
  let service: HealthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = moduleRef.get(HealthService);
  });

  it("reports application health without querying the database", () => {
    expect(service.live()).toEqual({ status: "ok" });
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it("reports ready when the database answers", async () => {
    dataSource.query.mockImplementation(async () => [{ "?column?": 1 }]);

    await expect(service.ready()).resolves.toEqual({ status: "ok" });
    expect(dataSource.query).toHaveBeenCalledWith("SELECT 1");
  });

  it("reports unavailable when the database cannot be reached", async () => {
    dataSource.query.mockImplementation(async () => {
      throw new Error("connection refused");
    });

    await expect(service.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
