import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DocumentsService } from "./documents.service.js";
import { DocumentRecord } from "./entity/document.entity.js";

describe("DocumentsService", () => {
  let service: DocumentsService;
  const repository = {
    create: jest.fn((input: unknown) => input),
    save: jest.fn((..._args: unknown[]): unknown => undefined),
    find: jest.fn((..._args: unknown[]): unknown => undefined),
    findOne: jest.fn((..._args: unknown[]): unknown => undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        DocumentsService,
        {
          provide: getRepositoryToken(DocumentRecord),
          useValue: repository,
        },
      ],
    }).compile();
    service = moduleRef.get(DocumentsService);
  });

  it("creates a document metadata record", async () => {
    const saved = { id: "doc-1", title: "Runbook" };
    repository.save.mockImplementation(async () => saved);

    await expect(
      service.create({
        title: "Runbook",
        filename: "runbook.txt",
        contentType: "text/plain",
        sizeBytes: 12,
      }),
    ).resolves.toBe(saved);

    expect(repository.create).toHaveBeenCalledWith({
      title: "Runbook",
      filename: "runbook.txt",
      contentType: "text/plain",
      sizeBytes: 12,
      description: null,
    });
  });

  it("lists documents from the repository", async () => {
    const rows = [{ id: "doc-1" }];
    repository.find.mockImplementation(async () => rows);

    await expect(service.list()).resolves.toBe(rows);
    expect(repository.find).toHaveBeenCalledWith({
      order: { createdAt: "DESC" },
    });
  });

  it("returns one document by id", async () => {
    const row = { id: "doc-1" };
    repository.findOne.mockImplementation(async () => row);

    await expect(service.findOne("doc-1")).resolves.toBe(row);
  });

  it("rejects a missing document", async () => {
    repository.findOne.mockImplementation(async () => null);

    await expect(service.findOne("missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
