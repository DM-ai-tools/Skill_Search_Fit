"""Export FastAPI OpenAPI schema to backend/openapi.json."""

from __future__ import annotations

import json
from pathlib import Path

from app.main import app


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    output_path = root / "openapi.json"
    schema = app.openapi()
    output_path.write_text(json.dumps(schema, indent=2), encoding="utf-8")
    print(f"Wrote {output_path}")


if __name__ == "__main__":
    main()
