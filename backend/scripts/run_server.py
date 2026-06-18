"""Run uvicorn and capture all output."""
import subprocess, sys, os

os.chdir(os.path.join(os.path.dirname(__file__), ".."))
proc = subprocess.Popen(
    [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8011"],
    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True
)
for line in proc.stdout:
    print(line, end="", flush=True)
