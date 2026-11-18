import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { CreateDocumentDto } from "./dto/create-document.dto.js";
import { DocumentsService } from "./documents.service.js";

@Controller("documents")
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post()
  @HttpCode(201)
  create(@Body() body: CreateDocumentDto) {
    return this.documents.create(body);
  }

  @Get()
  list() {
    return this.documents.list();
  }

  @Get(":id")
  findOne(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.documents.findOne(id);
  }
}
