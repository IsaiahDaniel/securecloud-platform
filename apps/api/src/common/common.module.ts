import { Global, Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { AppErrorService } from "./errors/app-error.service.js";
import { DatabaseExceptionFilter } from "./exceptions/database-exception.filter.js";
import { DatabaseModule } from "./infrastructure/database/database.module.js";
import { LoggingModule } from "./infrastructure/logging/logging.module.js";

@Global()
@Module({
  imports: [DatabaseModule, LoggingModule],
  providers: [
    AppErrorService,
    DatabaseExceptionFilter,
    {
      provide: APP_FILTER,
      useExisting: DatabaseExceptionFilter,
    },
  ],
  exports: [
    DatabaseModule,
    LoggingModule,
    AppErrorService,
    DatabaseExceptionFilter,
  ],
})
export class CommonModule {}
