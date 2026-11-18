import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { DataSource } from "typeorm";

@Injectable()
export class HealthService {
  constructor(private readonly dataSource: DataSource) {}

  live(): { status: "ok" } {
    return { status: "ok" };
  }

  async ready(): Promise<{ status: "ok" }> {
    try {
      await this.dataSource.query("SELECT 1");
    } catch {
      throw new ServiceUnavailableException("database unavailable");
    }
    return { status: "ok" };
  }
}
