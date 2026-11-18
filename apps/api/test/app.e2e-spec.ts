import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Logger } from "nestjs-pino";
import request from "supertest";
import { DatabaseExceptionFilter } from "../src/common/exceptions/database-exception.filter.js";
import { startTestDatabase, type TestDatabase } from "./postgres.js";

describe("API", () => {
  let app: INestApplication;
  let database: TestDatabase;
  let server: Parameters<typeof request>[0];

  beforeAll(async () => {
    database = await startTestDatabase();
    process.env.NODE_ENV = "test";
    process.env.HOST = "127.0.0.1";
    process.env.PORT = "3000";
    process.env.LOG_LEVEL = "silent";
    process.env.DATABASE_URL = database.url;

    const { AppModule } = await import("../src/app.module.js");
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new DatabaseExceptionFilter());
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app?.close();
    await database?.stop();
  });

  it("GET /health reports application health", async () => {
    await request(server).get("/health").expect(200).expect({ status: "ok" });
  });

  it("GET /health/ready checks the database", async () => {
    await request(server)
      .get("/health/ready")
      .expect(200)
      .expect({ status: "ok" });
  });

  it("rejects an invalid document", async () => {
    await request(server).post("/documents").send({ title: "" }).expect(400);
  });

  it("creates, lists, and retrieves document metadata", async () => {
    const created = await request(server)
      .post("/documents")
      .send({
        title: "Architecture note",
        filename: "architecture.txt",
        contentType: "text/plain",
        sizeBytes: 42,
        description: "metadata only",
      })
      .expect(201);

    expect(created.body).toMatchObject({
      title: "Architecture note",
      filename: "architecture.txt",
      contentType: "text/plain",
      sizeBytes: 42,
      description: "metadata only",
    });
    expect(created.body.id).toEqual(expect.any(String));

    const listed = await request(server).get("/documents").expect(200);
    expect(listed.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: created.body.id }),
      ]),
    );

    const found = await request(server)
      .get(`/documents/${created.body.id}`)
      .expect(200);
    expect(found.body).toEqual(
      expect.objectContaining({ id: created.body.id }),
    );
  });

  it("returns 404 for an unknown document id", async () => {
    await request(server)
      .get("/documents/00000000-0000-4000-8000-000000000000")
      .expect(404);
  });

  it("returns 400 for a document id that is not a uuid", async () => {
    await request(server).get("/documents/not-a-uuid").expect(400);
  });
});
