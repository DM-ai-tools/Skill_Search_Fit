"""Run uvicorn and capture all output."""
import os
import subprocess
import sys

os.chdir(os.path.join(os.path.dirname(__file__), ".."))
port = os.environ.get("PORT", "8000")
proc = subprocess.Popen(
    [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", port],
    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True
)
for line in proc.stdout:
    print(line, end="", flush=True)
