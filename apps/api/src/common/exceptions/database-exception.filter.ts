import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Injectable,
  Logger,
} from "@nestjs/common";
import { EntityNotFoundError, QueryFailedError, TypeORMError } from "typeorm";

interface HttpResponse {
  status(code: number): { json(body: unknown): void };
}

interface DriverError {
  code?: unknown;
  detail?: unknown;
  constraint?: unknown;
}

const UNAVAILABLE_CODES = new Set([
  "57P01",
  "57P02",
  "57P03",
  "53300",
  "57014",
  "08000",
  "08003",
  "08006",
  "08001",
  "08004",
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "ECONNRESET",
]);

const BAD_REQUEST_CODES = new Set([
  "23502",
  "23514",
  "22P02",
  "22001",
  "22003",
]);

const TRANSACTION_CONFLICT_CODES = new Set(["40001", "40P01", "55P03"]);

@Injectable()
@Catch(TypeORMError)
export class DatabaseExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DatabaseExceptionFilter.name);

  catch(exception: TypeORMError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>();

    if (exception instanceof EntityNotFoundError) {
      response.status(HttpStatus.NOT_FOUND).json({
        statusCode: HttpStatus.NOT_FOUND,
        message: "Resource not found",
        error: "Not Found",
      });
      return;
    }

    const { code, detail, constraint } = extractDriverMetadata(exception);
    const constraintSuffix = constraint ? ` constraint=${constraint}` : "";
    this.logger.error(
      `database query failed code=${code ?? "unknown"}${constraintSuffix}`,
    );

    if (code === "23505") {
      response.status(HttpStatus.CONFLICT).json({
        statusCode: HttpStatus.CONFLICT,
        message: formatUniqueViolationMessage(detail),
        error: "Conflict",
      });
      return;
    }

    if (code === "23503") {
      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: "Referenced resource does not exist",
        error: "Bad Request",
      });
      return;
    }

    if (code !== undefined && BAD_REQUEST_CODES.has(code)) {
      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: "Invalid database input",
        error: "Bad Request",
      });
      return;
    }

    if (code !== undefined && TRANSACTION_CONFLICT_CODES.has(code)) {
      response.status(HttpStatus.CONFLICT).json({
        statusCode: HttpStatus.CONFLICT,
        message: "Database transaction conflict, please retry",
        error: "Conflict",
      });
      return;
    }

    if (code !== undefined && UNAVAILABLE_CODES.has(code)) {
      response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: "database unavailable",
        error: "Service Unavailable",
      });
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: "Database request failed",
      error: "Internal Server Error",
    });
  }
}

function extractDriverMetadata(exception: TypeORMError): {
  code?: string;
  detail?: string;
  constraint?: string;
} {
  const driverError =
    exception instanceof QueryFailedError
      ? (exception.driverError as DriverError | undefined)
      : (exception as unknown as { driverError?: DriverError }).driverError;

  const topLevelCode = (exception as unknown as { code?: unknown }).code;
  const rawCode = driverError?.code ?? topLevelCode;

  return {
    code: typeof rawCode === "string" ? rawCode : undefined,
    detail:
      typeof driverError?.detail === "string" ? driverError.detail : undefined,
    constraint:
      typeof driverError?.constraint === "string"
        ? driverError.constraint
        : undefined,
  };
}

function formatUniqueViolationMessage(detail: string | undefined): string {
  if (detail) {
    const match = /^Key \(([^)]+)\)=\(.+\) already exists\.$/.exec(detail);
    if (match?.[1]) {
      return `${match[1]} already exists`;
    }
  }
  return "Document already exists";
}
