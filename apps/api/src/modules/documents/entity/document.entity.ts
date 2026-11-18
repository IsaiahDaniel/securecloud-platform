import { Column, Entity } from "typeorm";
import { AbstractEntity } from "../../../common/infrastructure/database/abstract.entity.js";

@Entity({ name: "documents" })
export class DocumentRecord extends AbstractEntity<DocumentRecord> {
  @Column({ type: "varchar", length: 200 })
  title!: string;

  @Column({ type: "varchar", length: 255 })
  filename!: string;

  @Column({ name: "content_type", type: "varchar", length: 127 })
  contentType!: string;

  @Column({ name: "size_bytes", type: "integer" })
  sizeBytes!: number;

  @Column({ type: "text", nullable: true })
  description!: string | null;
}
