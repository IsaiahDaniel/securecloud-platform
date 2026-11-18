# Threat model

This note covers the local platform: the API process, its container image, and the manifests in this repository. It does not describe a deployed cloud account.

## Assets

- API process and the document metadata it stores
- PostgreSQL database reached through `DATABASE_URL`
- Container image built from `apps/api/Dockerfile`
- Kubernetes and Compose manifests
- CI identity used by `.github/workflows/ci.yml`

## Trust boundaries

- Callers on the host reach the API only through the published loopback port.
- The API container runs as a non-root user and does not mount the Docker socket.
- Terraform in this repository does not create cloud resources and does not hold credentials.

## Threats

| Threat | Impact | Current control |
| --- | --- | --- |
| Unpinned base or workload image | Unexpected code in a rebuild | Image tags are set, and the audit flags `:latest` and missing tags |
| Privileged container | Host breakout | Manifests do not set `privileged: true`; the audit flags it |
| Secrets committed in Compose or Terraform | Credential leak | `.env` is gitignored. The audit flags private-key material. Compose has a local-only database password fallback; the cluster reads `DATABASE_URL` from the `api-database` secret |
| API exposed beyond the workstation | Unwanted network access | Compose publishes the API on `127.0.0.1:3000` and PostgreSQL on `127.0.0.1:5432` |

Review this file again before the Terraform module creates real infrastructure.
