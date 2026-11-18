# Secure Cloud Platform

The document API is a NestJS service in `apps/api`. Python stays in the default uv layout for the repository audit.

```
securecloud-platform/
├── apps/api/                     # NestJS API, Dockerfile, tests
│   ├── src/
│   ├── test/
│   ├── Dockerfile
│   └── package.json
├── src/securecloud_platform/     # uv package: repository audit
├── security/python/audit.py
├── infrastructure/terraform/
├── kubernetes/
├── docs/
├── compose.yaml
├── pyproject.toml
└── .python-version
```

## API

Copy `apps/api/.env.example` to `apps/api/.env` and set `DATABASE_URL`. The example file has no usable password.

```bash
npm ci --prefix apps/api
npm start --prefix apps/api
```

With Compose, the API and PostgreSQL start together. The database password fallback in `compose.yaml` is for local development only. Override `POSTGRES_PASSWORD` in a gitignored `.env` file.

```bash
docker compose up --build
```

`GET http://127.0.0.1:3000/health` reports process health. `GET http://127.0.0.1:3000/health/ready` also checks PostgreSQL.

```bash
npm test --prefix apps/api
npm run test:e2e --prefix apps/api
```

## Audit

```bash
uv sync
uv run pytest
uv run python security/python/audit.py
```

See `docs/architecture.md`, `docs/threat-model.md`, and `docs/incident-response.md`.
