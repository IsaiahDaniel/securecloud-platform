import { describe, expect, it, jest } from "@jest/globals";
import { ArgumentsHost, HttpStatus } from "@nestjs/common";
import { EntityNotFoundError, QueryFailedError, TypeORMError } from "typeorm";
import { DatabaseExceptionFilter } from "./database-exception.filter.js";

describe("DatabaseExceptionFilter", () => {
  const filter = new DatabaseExceptionFilter();

  function host() {
    const json = jest.fn((..._args: unknown[]): unknown => undefined);
    const status = jest.fn((..._args: unknown[]) => ({ json }));
    return { response: { status, json } };
  }

  function argumentsHost(response: {
    status: (code: number) => { json: (body: unknown) => void };
  }): ArgumentsHost {
    return {
      switchToHttp: () => ({
        getResponse: () => response,
      }),
    } as ArgumentsHost;
  }

  it("maps unique violations to a conflict response", () => {
    const { response } = host();
    filter.catch(queryError("23505"), argumentsHost(response));

    expect(response.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.CONFLICT,
        message: "Document already exists",
      }),
    );
  });

  it("formats unique violation field names without leaking field values", () => {
    const { response } = host();
    filter.catch(
      queryError("23505", {
        detail: "Key (filename)=(secret-file.txt) already exists.",
        constraint: "UQ_documents_filename",
      }),
      argumentsHost(response),
    );

    expect(response.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    const body = response.json.mock.calls[0]?.[0] as { message: string };
    expect(body.message).toBe("filename already exists");
    expect(JSON.stringify(body)).not.toContain("secret-file.txt");
  });

  it("maps foreign key violations to bad request", () => {
    const { response } = host();
    filter.catch(queryError("23503"), argumentsHost(response));

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: "Referenced resource does not exist",
      }),
    );
  });

  it("maps invalid input and constraint violations to bad request", () => {
    const { response } = host();
    filter.catch(queryError("22P02"), argumentsHost(response));

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: "Invalid database input",
      }),
    );
  });

  it("maps transaction serialization/deadlock errors to conflict", () => {
    const { response } = host();
    filter.catch(queryError("40P01"), argumentsHost(response));

    expect(response.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.CONFLICT,
        message: "Database transaction conflict, please retry",
      }),
    );
  });

  it("maps EntityNotFoundError to not found", () => {
    const { response } = host();
    filter.catch(
      new EntityNotFoundError("DocumentRecord", { id: "missing" }),
      argumentsHost(response),
    );

    expect(response.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.NOT_FOUND,
        message: "Resource not found",
      }),
    );
  });

  it("maps connection failures to service unavailable", () => {
    const { response } = host();
    filter.catch(queryError("57P01"), argumentsHost(response));

    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  });

  it("hides other database failures behind a generic error", () => {
    const { response } = host();
    filter.catch(queryError("42703"), argumentsHost(response));

    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    const body = response.json.mock.calls[0]?.[0] as { message: string };
    expect(body.message).toBe("Database request failed");
    expect(JSON.stringify(body)).not.toContain("secret-column");
  });

  it("handles generic TypeORMError instances safely", () => {
    const { response } = host();
    filter.catch(
      new TypeORMError("internal relation mapping error"),
      argumentsHost(response),
    );

    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    const body = response.json.mock.calls[0]?.[0] as { message: string };
    expect(body.message).toBe("Database request failed");
    expect(JSON.stringify(body)).not.toContain("internal relation mapping");
  });
});

function queryError(
  code: string,
  extra?: { detail?: string; constraint?: string },
): QueryFailedError {
  const driverError = new Error("failed near secret-column") as Error & {
    code: string;
    detail?: string;
    constraint?: string;
  };
  driverError.code = code;
  if (extra?.detail) {
    driverError.detail = extra.detail;
  }
  if (extra?.constraint) {
    driverError.constraint = extra.constraint;
  }
  return new QueryFailedError("insert into documents", [], driverError);
}
