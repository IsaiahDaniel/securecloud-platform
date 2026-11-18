import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DocumentsController } from "./documents.controller.js";
import { DocumentsService } from "./documents.service.js";
import { DocumentRecord } from "./entity/document.entity.js";

@Module({
  imports: [TypeOrmModule.forFeature([DocumentRecord])],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
