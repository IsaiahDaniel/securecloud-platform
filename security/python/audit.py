#!/usr/bin/env python3
"""Security auditing CLI for SecureCloud Platform.

Checks required environment variables, verifies configuration files, runs
repository/container security checks, emits a JSON security report, and exits
with a non-zero status code if any critical check fails.

Usage from the repository root:
    uv run python security/python/audit.py
    uv run python security/python/audit.py --env DATABASE_URL,NODE_ENV --config compose.yaml
    python3 security/python/audit.py --help
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SRC_DIR = REPO_ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

os.chdir(REPO_ROOT)

from securecloud_platform.audit import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main(root=REPO_ROOT, argv=sys.argv[1:]))
