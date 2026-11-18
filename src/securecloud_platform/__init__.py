import os
import sys

from securecloud_platform.server import serve


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] == "audit":
        from securecloud_platform.audit import main as audit_main

        raise SystemExit(audit_main(argv=sys.argv[2:]))

    host = os.environ.get("SECURECLOUD_HOST", "127.0.0.1")
    port = int(os.environ.get("SECURECLOUD_PORT", "8000"))
    serve(host, port)
