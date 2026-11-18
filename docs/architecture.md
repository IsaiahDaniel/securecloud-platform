# Architecture

`apps/api` is the NestJS document API. The repository root stays a uv project for the audit package: `pyproject.toml`, `.python-version`, and `src/securecloud_platform/`.

| Path | Role |
| --- | --- |
| `apps/api/src` | HTTP API. Health, readiness, and document metadata. |
| `apps/api/test` | Integration tests against an ephemeral PostgreSQL instance. |
| `apps/api/Dockerfile` | Dev and runtime images for the API. |
| `apps/api/package.json` | Node manifest. Dependencies are locked in `package-lock.json`. |
| `src/securecloud_platform/` | Python audit checks. |
| `security/python/audit.py` | Audit runner. Python dependencies stay in the root `pyproject.toml`. |
| `compose.yaml` | Local API and PostgreSQL. The API is published on `127.0.0.1:3000`. The database is published on `127.0.0.1:5432`. |
| `kubernetes/api.yaml` | Deployment and Service. `DATABASE_URL` is read from the `api-database` secret. |
| `infrastructure/terraform/` | Terraform root module. No cloud resources yet. |
| `.github/workflows/ci.yml` | Python audit and the API unit and integration tests. |

Configuration comes from environment variables: `HOST`, `PORT`, `LOG_LEVEL`, `NODE_ENV`, and `DATABASE_URL`. Logs are JSON. Request bodies are validated before they reach the database.

`GET /health` checks the process. `GET /health/ready` runs `SELECT 1`. Document routes store metadata only.

```bash
npm start --prefix apps/api
uv run python security/python/audit.py
docker compose up --build
```

Build the runtime image tagged in the Kubernetes manifest with:

```bash
docker build --target runtime -t securecloud-api:0.1.0 apps/api
```
