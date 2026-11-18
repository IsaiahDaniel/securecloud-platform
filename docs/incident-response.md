# Incident response

Use this when a check fails, a container is running a privileged workload, or a secret shows up in the repository.

## Severity

| Level | Examples |
| --- | --- |
| High | A live secret in git, a privileged container, or an unexpected image tag in a deployed manifest |
| Medium | CI red on the audit, or a manifest change that drops `runAsNonRoot` |
| Low | A local-only health check failure |

## Steps

1. Record the time, the failing command, and the file path. Do not paste secret values into tickets or chat.
2. Stop the affected local stack with `docker compose down` if a container is involved. That keeps the `db-data` volume. Deleting that volume also deletes local document metadata.
3. Rotate any credential that was committed, then remove it from the working tree. Treat a pushed secret as already exposed.
4. Fix the manifest or image tag and re-run `uv run python security/python/audit.py`.
5. Re-run `uv run pytest`, `npm test --prefix apps/api`, and `npm run test:e2e --prefix apps/api` before merging the fix.
6. Note what changed and what still needs a human decision, especially if cloud resources are added later.
