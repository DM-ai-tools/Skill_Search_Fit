#!/bin/sh
set -e

cd "$(dirname "$0")/.."

echo "Running database migrations..."
python scripts/migrate.py

echo "Ensuring admin user exists..."
python scripts/seed_admin.py

echo "Syncing plugin catalog..."
python scripts/seed_plugins.py

PORT="${PORT:-8000}"
echo "Starting API on 0.0.0.0:${PORT}"
exec python -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT}"
