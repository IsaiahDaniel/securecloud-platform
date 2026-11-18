import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CreateDocumentDto } from "./dto/create-document.dto.js";
import { DocumentRecord } from "./entity/document.entity.js";

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(DocumentRecord)
    private readonly documents: Repository<DocumentRecord>,
  ) {}

  create(input: CreateDocumentDto): Promise<DocumentRecord> {
    const record = this.documents.create({
      title: input.title,
      filename: input.filename,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      description: input.description ?? null,
    });
    return this.documents.save(record);
  }

  list(): Promise<DocumentRecord[]> {
    return this.documents.find({
      order: { createdAt: "DESC" },
    });
  }

  async findOne(id: string): Promise<DocumentRecord> {
    const record = await this.documents.findOne({ where: { id } });
    if (!record) {
      throw new NotFoundException("Document not found");
    }
    return record;
  }
}
