import json
from pathlib import Path

import pytest

from securecloud_platform.audit import (
    audit,
    build_security_report,
    check_config_files,
    check_env_vars,
    main,
    scan_text,
)


def test_flags_latest_and_privileged() -> None:
    text = "\n".join(
        [
            "image: nginx:latest",
            "image: nginx",
            "privileged: true",
            "FROM python:3.12-slim",
        ]
    )
    rules = {finding.rule for finding in scan_text("demo.yaml", text)}
    assert rules == {"unpinned-image", "privileged"}
    images = [finding.message for finding in scan_text("demo.yaml", text)]
    assert any("nginx:latest" in message for message in images)
    assert any(message.endswith("nginx has no specific tag") for message in images)


def test_allows_dockerfile_stage_aliases() -> None:
    text = "\n".join(
        [
            "FROM python:3.12-slim-bookworm AS build",
            "FROM build AS runtime",
        ]
    )
    assert scan_text("Dockerfile", text) == []


def test_accepts_tagged_images() -> None:
    text = "\n".join(
        [
            "image: securecloud-api:0.1.0",
            "FROM node:22-alpine AS runtime",
        ]
    )
    assert scan_text("demo.yaml", text) == []


def test_repository_audit_passes() -> None:
    root = Path(__file__).resolve().parents[1]
    assert audit(root) == []


def test_check_env_vars_detects_present_and_missing() -> None:
    env = {"DATABASE_URL": "postgres://localhost/db", "EMPTY_VAR": "   "}
    results = check_env_vars(["DATABASE_URL", "MISSING_VAR", "EMPTY_VAR"], env)

    assert [r.passed for r in results] == [True, False, False]
    assert results[0].name == "env:DATABASE_URL"
    assert results[1].severity == "critical"


def test_check_config_files_detects_existing_and_missing(tmp_path: Path) -> None:
    config_file = tmp_path / "config.yaml"
    config_file.write_text("env: prod\n", encoding="utf-8")

    results = check_config_files(["config.yaml", "missing.yaml"], tmp_path)
    assert [r.passed for r in results] == [True, False]
    assert results[0].name == "config:config.yaml"
    assert results[1].severity == "critical"


def test_cli_produces_json_report_and_exits_zero_when_checks_pass(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    cfg = tmp_path / "settings.json"
    cfg.write_text("{}", encoding="utf-8")

    exit_code = main(
        root=tmp_path,
        argv=[
            "--env",
            "DATABASE_URL,NODE_ENV",
            "--config",
            "settings.json",
            "--skip-repo-audit",
        ],
        env={"DATABASE_URL": "postgres://u:p@localhost:5432/db", "NODE_ENV": "test"},
    )

    assert exit_code == 0
    captured = capsys.readouterr()
    report = json.loads(captured.out)
    assert report["status"] == "passed"
    assert report["summary"]["critical_failures"] == 0
    assert report["summary"]["total_checks"] == 3


def test_cli_exits_nonzero_when_required_env_var_is_missing(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    cfg = tmp_path / "settings.json"
    cfg.write_text("{}", encoding="utf-8")

    exit_code = main(
        root=tmp_path,
        argv=[
            "--env",
            "DATABASE_URL,AWS_SECRET_ACCESS_KEY",
            "--config",
            "settings.json",
            "--skip-repo-audit",
        ],
        env={"DATABASE_URL": "postgres://u:p@localhost:5432/db"},
    )

    assert exit_code == 1
    report = json.loads(capsys.readouterr().out)
    assert report["status"] == "failed"
    assert report["summary"]["critical_failures"] == 1


def test_cli_exits_nonzero_when_config_file_is_missing(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    exit_code = main(
        root=tmp_path,
        argv=[
            "--env",
            "DATABASE_URL",
            "--config",
            "nonexistent.yaml",
            "--skip-repo-audit",
        ],
        env={"DATABASE_URL": "postgres://u:p@localhost:5432/db"},
    )

    assert exit_code == 1
    report = json.loads(capsys.readouterr().out)
    assert report["status"] == "failed"
    assert report["summary"]["critical_failures"] == 1
