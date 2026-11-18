# NestJS API Architecture, Q&A, and Implementation Notes

This document summarizes all questions asked, architectural explanations, troubleshooting fixes, and features implemented in the `apps/api` NestJS service.

---

## 1. Restructuring `apps/api` to Match the `ln24` Architecture (`common/` & `modules/`)

### Question
> *"I want the structure of this app to be like ln24 — a `modules` folder and `common` where the rest of the logic should be shared (that's for the Nest app in my setup)."*

### Explanation & What Was Added
The NestJS application in `apps/api/src` was reorganized into two top-level directories—`common/` (shared infrastructure, config, error handling, and base entities) and `modules/` (feature domains)—matching the `ln24-be` architecture:

```text
apps/api/src/
├── app.module.ts
├── main.ts
├── common/
│   ├── common.module.ts
│   ├── config/
│   │   └── env.validation.ts
│   ├── errors/
│   │   └── app-error.service.ts
│   ├── exceptions/
│   │   ├── database-exception.filter.ts
│   │   └── database-exception.filter.spec.ts
│   └── infrastructure/
│       ├── database/
│       │   ├── abstract.entity.ts
│       │   ├── database.module.ts
│       │   └── migrations/
│       │       └── create-documents.migration.ts
│       └── logging/
│           ├── logging.module.ts
│           └── logging.module.spec.ts
└── modules/
    ├── documents/
    │   ├── documents.controller.ts
    │   ├── documents.module.ts
    │   ├── documents.service.ts
    │   ├── documents.service.spec.ts
    │   ├── dto/
    │   │   └── create-document.dto.ts
    │   └── entity/
    │       └── document.entity.ts
    └── health/
        ├── health.controller.ts
        ├── health.module.ts
        ├── health.service.ts
        └── health.service.spec.ts
```

- **`CommonModule` (`apps/api/src/common/common.module.ts`)**: Marked `@Global()` so shared modules (`DatabaseModule`, `LoggingModule`) and providers (`AppErrorService`, `DatabaseExceptionFilter`) are available across the application.
- **`AbstractEntity` (`apps/api/src/common/infrastructure/database/abstract.entity.ts`)**: Shared base entity providing `id` (UUID), `createdAt`, and `updatedAt` columns, extended by `DocumentRecord`.
- **`DatabaseModule` (`apps/api/src/common/infrastructure/database/database.module.ts`)**: Encapsulates `TypeOrmModule.forRootAsync(...)` and migrations (`CreateDocuments1710000000000`).
- **Feature Modules (`apps/api/src/modules/`)**: Separated `documents` (controller, service, module, `dto/`, `entity/`) and `health` (liveness and readiness probes).

---

## 2. Environment Variables & `DATABASE_URL` Configuration

### Question
> *"How does the current application relate to this — Use environment variables for configuration, the DB seems to need a url, does that work?"*

### Explanation
Yes, `DATABASE_URL` works natively with TypeORM's PostgreSQL driver, and the application validates all required environment variables at startup:

1. **Loading & Validation**:
   - `AppModule` registers `ConfigModule.forRoot({ isGlobal: true, validate: validateEnv })`.
   - `apps/api/src/common/config/env.validation.ts` validates environment variables using Joi:
     - `NODE_ENV`: `"development" | "test" | "production"` (defaults to `"development"`)
     - `HOST`: defaults to `"127.0.0.1"`
     - `PORT`: defaults to `3000`
     - `LOG_LEVEL`: `"fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent"` (defaults to `"info"`)
     - `DATABASE_URL`: **required**, must match `postgres://...` or `postgresql://...`
2. **How `DATABASE_URL` Works Across Environments**:
   - **TypeORM (`database.module.ts`)**: Passes `url: config.getOrThrow<string>("DATABASE_URL")` directly to TypeORM, which parses the connection URI (`postgresql://user:password@host:port/dbname`).
   - **Local Development (`apps/api/.env`)**: Loaded automatically by `@nestjs/config`.
   - **Docker Compose (`compose.yaml`)**: Injects `DATABASE_URL: postgres://appuser:${POSTGRES_PASSWORD:-devonly}@db:5432/securecloud`.
   - **Kubernetes (`kubernetes/api.yaml`)**: Injects `DATABASE_URL` from the `api-database` Kubernetes Secret.
   - **E2E Tests (`apps/api/test/app.e2e-spec.ts`)**: Dynamically sets `DATABASE_URL` to an ephemeral `embedded-postgres` instance.

---

## 3. Troubleshooting: `TypeError: Joi.string is not a function` (Node 22 ESM)

### Question / Error
```text
/home/isaiah-daniel/Documents/securecloud-platform/apps/api/src/common/config/env.validation.ts:4
  NODE_ENV: Joi.string()
                ^
TypeError: Joi.string is not a function
```

### Explanation & What Was Changed
- **Root Cause**: `apps/api/package.json` uses `"type": "module"` (native Node.js ESM), whereas `joi` is packaged as a CommonJS module (`module.exports = ...`). Under Node 22 ESM, a namespace import (`import * as Joi from "joi"`) wraps the CommonJS export inside `{ default: Joi }`, making `Joi.string` undefined at runtime.
- **Fix**: Updated `apps/api/src/common/config/env.validation.ts` to use a default import:
  ```ts
  import Joi from "joi";
  ```

---

## 4. Troubleshooting: `Error: listen EADDRINUSE: address already in use 127.0.0.1:5432`

### Question / Error
```text
Error: listen EADDRINUSE: address already in use 127.0.0.1:5432
```

### Explanation & What Was Changed
- **Root Cause**: `PORT=5432` was set in `apps/api/.env`. In `apps/api/src/main.ts`, `PORT` is the HTTP port that the NestJS server binds to (`await app.listen(port, host)`), and port `5432` was already occupied by the running PostgreSQL database server.
- **Fix**: Changed `PORT=5432` to `PORT=3000` in `apps/api/.env` so the NestJS HTTP server listens on port `3000` while connecting to PostgreSQL on port `5432` via `DATABASE_URL`.

---

## 5. Structured Logging (`Implement structured logging`)

### Question
> *"What of this bit — Implement structured logging."*  
> *"yes do that."*

### Explanation & What Was Added
Structured JSON logging is implemented with **`nestjs-pino`** (`pino` + `pino-http`) and centralized in `CommonModule`:

1. **Created `LoggingModule` (`apps/api/src/common/infrastructure/logging/logging.module.ts`)**:
   - Configures `LoggerModule.forRootAsync` using `LOG_LEVEL` and `NODE_ENV` from `ConfigService`.
   - **Service Metadata**: Attaches `base: { service: "securecloud-api", env }` to every JSON log entry.
   - **Sensitive Header Redaction**: Redacts `req.headers.authorization`, `req.headers.cookie`, and `res.headers["set-cookie"]` with `"[REDACTED]"` so credentials/tokens are never written to logs.
   - **Request Correlation IDs**: Reuses incoming `x-request-id` headers when present or generates a new UUID (`randomUUID()`) per request.
   - **Test Silence**: Automatically disables HTTP request auto-logging when `LOG_LEVEL=silent`.
2. **Global Logger Wiring (`apps/api/src/main.ts` & `apps/api/src/common/common.module.ts`)**:
   - `LoggingModule` is imported and exported by `CommonModule`.
   - `main.ts` buffers startup logs (`{ bufferLogs: true }`) and registers Pino as the global NestJS logger (`app.useLogger(app.get(Logger))`).
3. **Unit Tests (`apps/api/src/common/infrastructure/logging/logging.module.spec.ts`)**:
   - Verifies service metadata, header redaction configuration, `LOG_LEVEL=silent` behavior, and `x-request-id` propagation/generation.

---

## 6. Database Error Handling (`Handle database errors properly`)

### Question
> *"Did we do this? Handle database errors properly."*  
> *"yes add that too"*

### Explanation & What Was Added
Database errors are handled across the request lifecycle without leaking SQL queries, table names, or sensitive column values to clients:

1. **Global `DatabaseExceptionFilter` (`apps/api/src/common/exceptions/database-exception.filter.ts`)**:
   - Decorated with `@Catch(TypeORMError)` and `@Injectable()` to catch `QueryFailedError`, `EntityNotFoundError`, and any other `TypeORMError`.
   - Logs structured error metadata (`database query failed code=... constraint=...`) via the NestJS/Pino logger.
   - Maps database andPostgreSQL driver errors to clean HTTP status codes:
     | Error / Postgres Code | HTTP Status | Client Response Message |
     | --- | --- | --- |
     | `EntityNotFoundError` | `404 Not Found` | `"Resource not found"` |
     | `23505` (Unique violation) | `409 Conflict` | `"<field> already exists"` (parsed safely from `detail` without leaking the rejected value) or `"Document already exists"` |
     | `23503` (Foreign key violation) | `400 Bad Request` | `"Referenced resource does not exist"` |
     | `23502`, `23514`, `22P02`, `22001`, `22003` (Not-null, check, invalid input syntax, string truncation, numeric overflow) | `400 Bad Request` | `"Invalid database input"` |
     | `40001`, `40P01`, `55P03` (Serialization failure, deadlock, lock not available) | `409 Conflict` | `"Database transaction conflict, please retry"` |
     | `57P01`, `57P02`, `57P03`, `53300`, `57014`, `08000`, `08003`, `08006`, `08001`, `08004`, `ECONNREFUSED`, `ENOTFOUND`, `ETIMEDOUT`, `ECONNRESET` | `503 Service Unavailable` | `"database unavailable"` |
     | All other `QueryFailedError` / `TypeORMError` | `500 Internal Server Error` | `"Database request failed"` (masks internal SQL/schema details) |

2. **Shared `AppErrorService` (`apps/api/src/common/errors/app-error.service.ts`)**:
   - Provides standardized helper methods (`notFound`, `badRequest`, `unauthorized`, `forbidden`, `conflict`, `serviceUnavailable`, `internal`) matching the `ln24-be` error service pattern.

3. **Global DI Registration (`apps/api/src/common/common.module.ts`)**:
   - Registers `DatabaseExceptionFilter` via NestJS `APP_FILTER` token and exports both `DatabaseExceptionFilter` and `AppErrorService`.

4. **Readiness & Route-Level Checks**:
   - `HealthService.ready()` (`apps/api/src/modules/health/health.service.ts`) executes `SELECT 1` and catches connection errors, throwing `503 Service Unavailable` (`"database unavailable"`).
   - `DocumentsController.findOne()` (`apps/api/src/modules/documents/documents.controller.ts`) validates UUID parameters with `ParseUUIDPipe` (`400 Bad Request`) before reaching the database, and `DocumentsService.findOne()` throws `NotFoundException` (`404 Not Found`) when a document record is absent.

5. **Unit Tests (`apps/api/src/common/exceptions/database-exception.filter.spec.ts`)**:
   - Tests unique constraint violations (both generic and field-specific without leaking values), foreign key violations, invalid input codes, deadlocks, `EntityNotFoundError`, connection failures, and generic `TypeORMError` masking.

---

## 7. Task 1B — Production-Oriented Dockerfile

### Question / Requirement
> *"Task 1B — Docker: Create a production-oriented Dockerfile. It should: Use a multi-stage build, Run as a non-root user, Avoid unnecessary packages, Use a health check, Keep secrets outside the image."*

### Explanation & What Was Added / Updated

Both [`apps/api/Dockerfile`](file:///home/isaiah-daniel/Documents/securecloud-platform/apps/api/Dockerfile) (NestJS API) and the root [`Dockerfile`](file:///home/isaiah-daniel/Documents/securecloud-platform/Dockerfile) (Python service) are configured for production hardening:

1. **Multi-Stage Build**:
   - In [`apps/api/Dockerfile`](file:///home/isaiah-daniel/Documents/securecloud-platform/apps/api/Dockerfile):
     - `deps`: Installs full dependencies with `npm ci` for building/testing.
     - `dev`: Development stage for Compose watch mode.
     - `build`: Compiles TypeScript source (`npm run build`) to `/app/dist`.
     - `prod-deps`: Runs `npm ci --omit=dev --ignore-scripts` in an isolated stage to produce production-only `node_modules`.
     - `runtime`: Clean final stage containing only `package.json`, production `node_modules`, and compiled `dist/`.
   - In root [`Dockerfile`](file:///home/isaiah-daniel/Documents/securecloud-platform/Dockerfile):
     - Separates `uv-bin`, `build` (compiles bytecode into `/opt/venv`), `dev`, and `runtime` (copies only `/opt/venv` without `uv` or build caches).

2. **Non-Root User**:
   - Creates system group `appgroup` (`GID 1001`) and system user `appuser` (`UID 1001`).
   - Copies application artifacts with `--chown=1001:1001` and switches to `USER appuser` before `ENTRYPOINT`.

3. **Avoids Unnecessary Packages**:
   - Uses pinned minimal base images (`node:22.22.1-alpine` and `python:3.12-slim-bookworm`) with zero extra OS packages (`apk add` / `apt-get install` are not used).
   - Dev dependencies (`@nestjs/cli`, `typescript`, `jest`, `embedded-postgres`, etc.), TypeScript source files, and tests are excluded from the final `runtime` image.

4. **Built-In Container `HEALTHCHECK`**:
   - Added `HEALTHCHECK` to [`apps/api/Dockerfile`](file:///home/isaiah-daniel/Documents/securecloud-platform/apps/api/Dockerfile) using Node's built-in `fetch` (avoiding installing `curl` or `wget` in the image):
     ```dockerfile
     HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
       CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT || 3000}/health`).then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
     ```
   - Added `HEALTHCHECK` to root [`Dockerfile`](file:///home/isaiah-daniel/Documents/securecloud-platform/Dockerfile) using Python's built-in `urllib.request`.

5. **Keeps Secrets Outside the Image**:
   - **Build-time secrets**: Private registry tokens (`.npmrc`) use BuildKit secret mounts (`--mount=type=secret,id=npmrc,target=/root/.npmrc,required=false`) so they never persist in image layers or `docker history`.
   - **Build context filtering**: [`apps/api/.dockerignore`](file:///home/isaiah-daniel/Documents/securecloud-platform/apps/api/.dockerignore) and root [`.dockerignore`](file:///home/isaiah-daniel/Documents/securecloud-platform/.dockerignore) explicitly exclude `.env`, `.env.*`, `**/.npmrc`, `*.pem`, `*.key`, `*.crt`, `*.p12`, `*.pfx`, `.git/`, and test files.
   - **Runtime secrets**: `DATABASE_URL` and credentials are never hardcoded in `ENV` or `ARG`; they are injected at runtime via environment variables (`compose.yaml` or Kubernetes `secretKeyRef` in `kubernetes/api.yaml`).

---

## 8. Running the API and PostgreSQL Locally with Docker Compose

### Question
> *"Do we have this — Use Docker Compose to run the API and PostgreSQL locally."*

### Explanation
Yes — [`compose.yaml`](file:///home/isaiah-daniel/Documents/securecloud-platform/compose.yaml) at the repository root is already configured to run both the NestJS API and PostgreSQL locally:

1. **`api` Service** ([`compose.yaml`](file:///home/isaiah-daniel/Documents/securecloud-platform/compose.yaml#L5-L42)):
   - Builds [`apps/api/Dockerfile`](file:///home/isaiah-daniel/Documents/securecloud-platform/apps/api/Dockerfile) targeting the `dev` stage.
   - Binds port `3000` to localhost only (`127.0.0.1:3000:3000`) so it is not exposed to external networks.
   - Connects to the `db` container over the internal Compose network using `DATABASE_URL: postgres://appuser:${POSTGRES_PASSWORD:-devonly}@db:5432/securecloud`.
   - Waits until PostgreSQL is healthy before starting (`depends_on.db.condition: service_healthy`).
   - Checks API + database readiness via `http://127.0.0.1:3000/health/ready`.
   - Mounts `./apps/api/src:/app/src` and supports `docker compose watch` for live reload and dependency rebuilds.

2. **`db` Service** ([`compose.yaml`](file:///home/isaiah-daniel/Documents/securecloud-platform/compose.yaml#L44-L62)):
   - Runs a pinned PostgreSQL image (`postgres:18.6`).
   - Initializes database `securecloud` and user `appuser`, allowing `POSTGRES_PASSWORD` to be overridden from a gitignored `.env` file.
   - Binds port `5432` to localhost only (`127.0.0.1:5432:5432`) and persists database files in the named volume `db-data`.
   - Runs `pg_isready -U appuser -d securecloud` as its container health check.

3. **How to Run**:
   ```bash
   docker compose up --build
   ```

### Troubleshooting: `services.api.healthcheck.test.3 must be a string`
- **Root Cause**: In [`compose.yaml`](file:///home/isaiah-daniel/Documents/securecloud-platform/compose.yaml#L28), the unquoted JavaScript expression `fetch(...).then((response) => process.exit(response.ok ? 0 : 1))` contained `: ` (from the ternary operator `? 0 : 1`), which the YAML parser interpreted as a nested key-value map instead of a string.
- **Fix**: Wrapped the JavaScript argument in single quotes in [`compose.yaml`](file:///home/isaiah-daniel/Documents/securecloud-platform/compose.yaml#L28):
  ```yaml
  - 'fetch("http://127.0.0.1:3000/health/ready").then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))'
  ```

### Troubleshooting: `permission denied while trying to connect to the docker API at unix:///var/run/docker.sock`
- **Root Cause**: On Linux, the Docker daemon socket (`/var/run/docker.sock`) is owned by `root:docker`. If your Linux user (`isaiah-daniel`) is not yet in the `docker` group (or the current shell session hasn't reloaded group memberships), running `docker` without `sudo` fails with `permission denied`.
- **Fix**:
  1. Add your user to the `docker` group and activate it in your current terminal:
     ```bash
     sudo usermod -aG docker $USER
     newgrp docker
     ```
  2. Or run Docker Compose with `sudo` directly:
     ```bash
     sudo docker compose up --build
     ```

---

## 9. What "Run as a Non-Root User" Means & Where It Is Applied

### Question
> *"I had said run as non-root user, what does that mean, and where in the code is it applied?"*

### Explanation

#### 1. What It Means (Container Process vs. Host Docker CLI)
- **Inside the Container (What the requirement means)**:
  - By default, Docker containers run their application process as `root` (`UID 0`). If a container runs as `root` and an attacker exploits a vulnerability in the application, they gain `root` privileges inside the container—making it much easier to modify files, install malicious tools, or attempt a container-escape attack against the host kernel.
  - **"Run as a non-root user"** means creating a low-privilege user inside the container image (`appuser`, `UID 1001`) and switching to that user with the `USER appuser` instruction before starting the app. Even if the application is compromised, the process has minimal permissions inside the container.
- **On Your Host Machine (Why `docker compose` asked for permission)**:
  - The earlier `permission denied ... /var/run/docker.sock` error happened on your **host laptop** because the `docker` CLI needs permission to talk to the background Docker engine (`dockerd`).
  - Even when you start Docker Compose on the host via `sudo docker compose up` (or via the `docker` group), the Node.js process **inside** the container still drops privileges and runs as `appuser` (`UID 1001`), **not** `root`.

#### 2. Where It Is Applied in the Code
1. **NestJS API Dockerfile ([`apps/api/Dockerfile`](file:///home/isaiah-daniel/Documents/securecloud-platform/apps/api/Dockerfile))**:
   - **`dev` stage ([lines 12–17](file:///home/isaiah-daniel/Documents/securecloud-platform/apps/api/Dockerfile#L12-L17))**:
     ```dockerfile
     RUN addgroup -S -g 1001 appgroup \
         && adduser -S -u 1001 -G appgroup appuser \
         && chown -R appuser:appgroup /app
     ...
     USER appuser
     ```
   - **`runtime` (production) stage ([lines 36–44](file:///home/isaiah-daniel/Documents/securecloud-platform/apps/api/Dockerfile#L36-L44))**:
     ```dockerfile
     RUN addgroup -S -g 1001 appgroup && \
         adduser -S -u 1001 -G appgroup appuser
     COPY --link --chown=1001:1001 package.json ./
     COPY --from=prod-deps --link --chown=1001:1001 /app/node_modules ./node_modules
     COPY --from=build --link --chown=1001:1001 /app/dist ./dist
     ...
     USER appuser
     ```
2. **Root Python Dockerfile ([`Dockerfile`](file:///home/isaiah-daniel/Documents/securecloud-platform/Dockerfile))**:
   - **`dev` stage ([lines 32–41](file:///home/isaiah-daniel/Documents/securecloud-platform/Dockerfile#L32-L41))** and **`runtime` stage ([lines 49–62](file:///home/isaiah-daniel/Documents/securecloud-platform/Dockerfile#L49-L62))**: Creates system group `appgroup` (`GID 1001`) and user `appuser` (`UID 1001`), assigns file ownership with `--chown=1001:1001`, and sets `USER appuser`.
3. **Kubernetes Manifest ([`kubernetes/api.yaml`](file:///home/isaiah-daniel/Documents/securecloud-platform/kubernetes/api.yaml#L17-L22))**:
   - Enforces non-root execution at the Kubernetes Pod and Container level so the cluster refuses to start the container if it ever tries to run as `root`:
     ```yaml
     securityContext:
       runAsNonRoot: true
       runAsUser: 1001
     ```
   - Also sets `allowPrivilegeEscalation: false` and drops all Linux kernel capabilities ([lines 42–46](file:///home/isaiah-daniel/Documents/securecloud-platform/kubernetes/api.yaml#L42-L46)).

---

## 10. Task 1C — Python Security Auditing CLI (`security/python/audit.py`)

### Question / Requirement
> *"Task 1C — Your first Python assignment: Create `security/python/audit.py`. Eventually, this will become our AWS security auditing tool using Boto3. For now, implement a simple Python CLI that:*
> - *Checks whether required environment variables exist.*
> - *Checks whether a specified configuration file exists.*
> - *Produces a JSON security report.*
> - *Exits with a non-zero status if a critical check fails.*
> *This gives us a foundation for automation and later AWS integration."*

### Explanation & What Was Added

1. **CLI Entrypoint ([`security/python/audit.py`](file:///home/isaiah-daniel/Documents/securecloud-platform/security/python/audit.py)) & Audit Engine ([`src/securecloud_platform/audit.py`](file:///home/isaiah-daniel/Documents/securecloud-platform/src/securecloud_platform/audit.py))**:
   - Can be executed via `uv run python security/python/audit.py`, `python3 security/python/audit.py`, or `uv run securecloud-platform audit`.
   - Supports CLI flags:
     - `--env` / `-e`: Required environment variable(s) to check (repeatable or comma-separated, e.g., `--env DATABASE_URL,NODE_ENV`; defaults to `DATABASE_URL, NODE_ENV, HOST, PORT`).
     - `--config` / `-c`: Configuration file path(s) to verify (repeatable; defaults to `compose.yaml`).
     - `--output` / `-o`: Optional file path to save the JSON report.
     - `--no-dotenv`: Check strictly against process environment variables without loading local `.env` / `apps/api/.env` fallback values.
     - `--skip-repo-audit`: Skip the repository layout/Dockerfile/secret manifest scan when running standalone env + config checks.

2. **How the Four Core Requirements Work**:
   - **Checks required environment variables (`check_env_vars`)**: Verifies each required variable is defined and non-empty. Missing or blank variables record a `critical` failure (`category: "environment"`).
   - **Checks whether a specified configuration file exists (`check_config_files`)**: Verifies each target configuration path exists and is a file (`Path.is_file()`). Missing files record a `critical` failure (`category: "configuration"`).
   - **Produces a JSON security report (`build_security_report`)**: Emits structured JSON containing `tool`, `timestamp` (UTC ISO-8601), overall `status` (`"passed"` or `"failed"`), `summary` (`total_checks`, `passed`, `failed`, `critical_failures`), and individual `checks` (structured to accommodate future AWS Boto3 checks such as IAM, S3, and Security Group audits).
   - **Exits with a non-zero status if a critical check fails**: Returns exit code `1` whenever `summary.critical_failures > 0`, and `0` when all critical checks pass.

3. **Example CLI Commands**:
   ```bash
   # Default audit (checks DATABASE_URL, NODE_ENV, HOST, PORT, compose.yaml, and repo manifests)
   uv run python security/python/audit.py

   # Check specific environment variables and configuration file
   uv run python security/python/audit.py --env DATABASE_URL,NODE_ENV --config compose.yaml

   # Save the JSON report to a file
   uv run python security/python/audit.py --output audit-report.json
   ```

4. **Automated Tests ([`tests/test_audit.py`](file:///home/isaiah-daniel/Documents/securecloud-platform/tests/test_audit.py))**:
   - Added unit tests covering present/missing/empty environment variables, existing/missing config files, JSON report structure, zero exit code on passing checks, and non-zero (`1`) exit code on missing environment variables or missing configuration files.
