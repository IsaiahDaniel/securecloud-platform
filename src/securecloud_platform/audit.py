"""Security auditing CLI and repository/manifest checks.

Foundation for automated security checks and future AWS (Boto3) auditing.
"""

from __future__ import annotations

import argparse
import json
import os
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Mapping, Sequence

_PEM_BEGIN = "-----BEGIN "

DEFAULT_REQUIRED_ENV_VARS: tuple[str, ...] = (
    "DATABASE_URL",
    "NODE_ENV",
    "HOST",
    "PORT",
)

DEFAULT_CONFIG_FILE = "compose.yaml"

DEFAULT_DOTENV_PATHS: tuple[str, ...] = (
    ".env",
    "apps/api/.env",
)

REQUIRED_PATHS = (
    "pyproject.toml",
    ".python-version",
    "README.md",
    ".gitignore",
    "Dockerfile",
    ".dockerignore",
    "compose.yaml",
    "docs/architecture.md",
    "docs/threat-model.md",
    "docs/incident-response.md",
    "infrastructure/terraform/versions.tf",
    "infrastructure/terraform/main.tf",
    "kubernetes/api.yaml",
    "src/securecloud_platform/__init__.py",
    "src/securecloud_platform/server.py",
    "src/securecloud_platform/audit.py",
    "security/python/audit.py",
    "apps/api/package.json",
    "apps/api/Dockerfile",
    "apps/api/src/main.ts",
    "apps/api/test/app.e2e-spec.ts",
)

GITIGNORE_MARKERS = (".env", ".venv/", "*.tfstate")

SECRET_MARKERS = (
    _PEM_BEGIN + "PRIVATE KEY-----",
    _PEM_BEGIN + "RSA PRIVATE KEY-----",
    _PEM_BEGIN + "OPENSSH PRIVATE KEY-----",
)

SKIP_DIRS = {
    ".git",
    ".venv",
    ".terraform",
    ".pytest_cache",
    "__pycache__",
    ".cursor",
    ".claude",
    "node_modules",
}


@dataclass(frozen=True)
class Finding:
    path: str
    line: int
    rule: str
    message: str


@dataclass(frozen=True)
class CheckResult:
    name: str
    category: str
    severity: str
    passed: bool
    message: str
    findings: list[str] = field(default_factory=list)


def load_dotenv_file(path: Path) -> dict[str, str]:
    """Parse simple KEY=VALUE lines from a .env file without external dependencies."""
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    try:
        content = path.read_text(encoding="utf-8")
    except OSError:
        return values

    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'\"")
        if key:
            values[key] = value
    return values


def resolve_environment(
    root: Path,
    env: Mapping[str, str] | None = None,
    use_dotenv: bool = True,
) -> dict[str, str]:
    """Return environment variables merged with local .env defaults when enabled."""
    if env is not None:
        return dict(env)

    merged: dict[str, str] = {}
    if use_dotenv:
        for rel_path in DEFAULT_DOTENV_PATHS:
            merged.update(load_dotenv_file(root / rel_path))
    merged.update(os.environ)
    return merged


def check_env_vars(
    required_vars: Sequence[str],
    env: Mapping[str, str],
) -> list[CheckResult]:
    """Check whether each required environment variable exists and is non-empty."""
    results: list[CheckResult] = []
    for var_name in required_vars:
        value = env.get(var_name)
        exists = value is not None and str(value).strip() != ""
        results.append(
            CheckResult(
                name=f"env:{var_name}",
                category="environment",
                severity="critical",
                passed=exists,
                message=(
                    f"Required environment variable '{var_name}' is set"
                    if exists
                    else f"Missing required environment variable '{var_name}'"
                ),
            )
        )
    return results


def check_config_files(
    config_paths: Sequence[str],
    root: Path,
) -> list[CheckResult]:
    """Check whether each specified configuration file exists."""
    results: list[CheckResult] = []
    for raw_path in config_paths:
        candidate = Path(raw_path)
        resolved = candidate if candidate.is_absolute() else (root / candidate)
        exists = resolved.is_file()
        results.append(
            CheckResult(
                name=f"config:{raw_path}",
                category="configuration",
                severity="critical",
                passed=exists,
                message=(
                    f"Configuration file '{raw_path}' exists"
                    if exists
                    else f"Configuration file '{raw_path}' does not exist"
                ),
            )
        )
    return results


def build_security_report(
    root: Path,
    required_env_vars: Sequence[str] = DEFAULT_REQUIRED_ENV_VARS,
    config_files: Sequence[str] = (DEFAULT_CONFIG_FILE,),
    env: Mapping[str, str] | None = None,
    use_dotenv: bool = True,
    include_repo_audit: bool = True,
) -> dict[str, object]:
    """Run all configured security checks and return a JSON-serializable report."""
    effective_env = resolve_environment(root, env=env, use_dotenv=use_dotenv)
    checks: list[CheckResult] = []
    checks.extend(check_env_vars(required_env_vars, effective_env))
    checks.extend(check_config_files(config_files, root))

    if include_repo_audit:
        repo_findings = audit(root)
        checks.append(
            CheckResult(
                name="repository_manifests",
                category="repository",
                severity="critical",
                passed=len(repo_findings) == 0,
                message=(
                    "All repository layout, container manifest, and secret checks passed"
                    if not repo_findings
                    else f"Repository audit found {len(repo_findings)} issue(s)"
                ),
                findings=repo_findings,
            )
        )

    total = len(checks)
    passed_count = sum(1 for check in checks if check.passed)
    failed_count = total - passed_count
    critical_failures = sum(
        1 for check in checks if not check.passed and check.severity == "critical"
    )

    return {
        "tool": "securecloud-security-audit",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status": "passed" if critical_failures == 0 else "failed",
        "summary": {
            "total_checks": total,
            "passed": passed_count,
            "failed": failed_count,
            "critical_failures": critical_failures,
        },
        "checks": [asdict(check) for check in checks],
    }


def scan_text(path: str, text: str) -> list[Finding]:
    aliases = _stage_aliases(text)
    findings: list[Finding] = []
    for line_number, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        if stripped.startswith("#"):
            continue
        if stripped.upper().startswith("FROM "):
            image = _image_token(stripped)
            if image in aliases or not _image_unpinned(image):
                continue
            findings.append(
                Finding(
                    path,
                    line_number,
                    "unpinned-image",
                    f"base image {image} has no specific tag",
                )
            )
        if "image:" in stripped:
            image = stripped.split("image:", 1)[1].strip().strip("'\"")
            if _image_unpinned(image):
                findings.append(
                    Finding(
                        path,
                        line_number,
                        "unpinned-image",
                        f"image {image} has no specific tag",
                    )
                )
        if stripped == "privileged: true":
            findings.append(
                Finding(
                    path,
                    line_number,
                    "privileged",
                    "container requests privileged mode",
                )
            )
    return findings


def default_targets(root: Path) -> list[Path]:
    targets: list[Path] = []
    for name in ("compose.yaml", "docker-compose.yml", "Dockerfile"):
        candidate = root / name
        if candidate.is_file():
            targets.append(candidate)
    targets.extend(sorted((root / "kubernetes").glob("*.yaml")))
    targets.extend(sorted((root / "kubernetes").glob("*.yml")))
    targets.extend(sorted((root / "apps").glob("**/Dockerfile")))
    return targets


def audit(root: Path) -> list[str]:
    findings: list[str] = []
    for relative in REQUIRED_PATHS:
        if not (root / relative).is_file():
            findings.append(f"missing {relative}")

    gitignore = root / ".gitignore"
    if gitignore.is_file():
        ignored = gitignore.read_text(encoding="utf-8")
        for marker in GITIGNORE_MARKERS:
            if marker not in ignored:
                findings.append(f".gitignore does not cover {marker}")

    for path in default_targets(root):
        text = path.read_text(encoding="utf-8")
        for finding in scan_text(str(path.relative_to(root)), text):
            findings.append(
                f"{finding.path}:{finding.line}: {finding.rule}: {finding.message}"
            )

    findings.extend(_secret_findings(root))
    return findings


def _parse_env_list(raw_values: Sequence[str] | None) -> list[str]:
    if not raw_values:
        return list(DEFAULT_REQUIRED_ENV_VARS)
    parsed: list[str] = []
    for item in raw_values:
        for part in item.split(","):
            cleaned = part.strip()
            if cleaned and cleaned not in parsed:
                parsed.append(cleaned)
    return parsed


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="audit.py",
        description=(
            "Run SecureCloud security audit checks (required environment variables, "
            "configuration files, and repository/container manifests) and output a JSON report."
        ),
    )
    parser.add_argument(
        "-e",
        "--env",
        action="append",
        dest="env_vars",
        metavar="VAR",
        help=(
            "Required environment variable name (can be passed multiple times or comma-separated). "
            f"Defaults to: {', '.join(DEFAULT_REQUIRED_ENV_VARS)}"
        ),
    )
    parser.add_argument(
        "-c",
        "--config",
        action="append",
        dest="config_files",
        metavar="PATH",
        help=(
            "Configuration file path that must exist (can be passed multiple times). "
            f"Defaults to: {DEFAULT_CONFIG_FILE}"
        ),
    )
    parser.add_argument(
        "-o",
        "--output",
        metavar="FILE",
        help="Optional file path to write the JSON security report to.",
    )
    parser.add_argument(
        "--no-dotenv",
        action="store_true",
        help="Check only process environment variables without reading local .env files.",
    )
    parser.add_argument(
        "--skip-repo-audit",
        action="store_true",
        help="Skip repository manifest and Dockerfile checks.",
    )
    return parser


def main(
    root: Path | None = None,
    argv: Sequence[str] | None = None,
    env: Mapping[str, str] | None = None,
) -> int:
    root = root or Path.cwd()
    parser = build_parser()
    args = parser.parse_args(argv if argv is not None else [])

    required_env = _parse_env_list(args.env_vars)
    config_files = args.config_files if args.config_files else [DEFAULT_CONFIG_FILE]

    report = build_security_report(
        root=root,
        required_env_vars=required_env,
        config_files=config_files,
        env=env,
        use_dotenv=not args.no_dotenv,
        include_repo_audit=not args.skip_repo_audit,
    )

    formatted = json.dumps(report, indent=2)
    print(formatted)

    if args.output:
        output_path = Path(args.output)
        if not output_path.is_absolute():
            output_path = root / output_path
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(formatted + "\n", encoding="utf-8")

    summary = report["summary"]
    assert isinstance(summary, dict)
    return 1 if int(summary["critical_failures"]) > 0 else 0


def _image_token(from_line: str) -> str:
    return _from_parts(from_line)[0]


def _stage_aliases(text: str) -> set[str]:
    aliases: set[str] = set()
    for line in text.splitlines():
        parts = line.strip().split()
        if len(parts) >= 4 and parts[0].upper() == "FROM" and parts[-2].upper() == "AS":
            aliases.add(parts[-1])
    return aliases


def _from_parts(from_line: str) -> tuple[str, str]:
    parts = from_line.split()
    image = parts[1] if len(parts) > 1 else ""
    stage = ""
    for index, part in enumerate(parts):
        if part.upper() == "AS" and index + 1 < len(parts):
            stage = parts[index + 1]
            break
    return image, stage


def _image_unpinned(image: str) -> bool:
    if not image or image.lower() == "scratch":
        return False
    name = image.split("/")[-1]
    return ":" not in name or name.endswith(":latest")


def _secret_findings(root: Path) -> list[str]:
    findings: list[str] = []
    for path in root.rglob("*"):
        if not path.is_file() or any(part in SKIP_DIRS for part in path.parts):
            continue
        if path.stat().st_size > 1_000_000:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for marker in SECRET_MARKERS:
            if marker in text:
                findings.append(f"private key material in {path.relative_to(root)}")
                break
    return findings
