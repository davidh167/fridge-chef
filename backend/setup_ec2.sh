#!/usr/bin/env bash
# Fridge Chef — EC2 setup script
# Run this once after SSHing into a fresh Amazon Linux instance.
# Tested on Amazon Linux 2 (yum) and Amazon Linux 2023 (dnf).
#
# Usage:
#   chmod +x backend/setup_ec2.sh
#   cd ~/fridge-chef && bash backend/setup_ec2.sh

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$REPO_DIR/backend"

echo "==> Detected repo root: $REPO_DIR"

# ---------------------------------------------------------------------------
# 1. System packages — works on both Amazon Linux 2 (yum) and AL2023 (dnf)
# ---------------------------------------------------------------------------
if command -v dnf &>/dev/null; then
  PKG="dnf"
else
  PKG="yum"
fi

echo "==> Installing system packages via $PKG"
sudo "$PKG" update -y
# python3.11 is available in both AL2023 (dnf) and AL2 extras repos
sudo "$PKG" install -y git python3.11 python3.11-pip 2>/dev/null || {
  # Fallback for AL2: python3.11 lives in amazon-linux-extras
  sudo amazon-linux-extras install python3.11 -y
}

# Point python3 at 3.11 for the rest of this script
PYTHON311="$(command -v python3.11)"
echo "==> Using Python: $PYTHON311 ($($PYTHON311 --version))"

# ---------------------------------------------------------------------------
# 2. Poetry — install via pip3.11 so it runs under the right interpreter
# ---------------------------------------------------------------------------
export PATH="$HOME/.local/bin:$PATH"

if ! command -v poetry &>/dev/null; then
  echo "==> Installing Poetry via pip3.11"
  "$PYTHON311" -m pip install --user poetry
fi

# ---------------------------------------------------------------------------
# 3. Python dependencies
# ---------------------------------------------------------------------------
echo "==> Pointing Poetry at Python 3.11"
cd "$BACKEND_DIR"
poetry env use "$PYTHON311"

echo "==> Installing Python dependencies"
poetry install --no-interaction

# ---------------------------------------------------------------------------
# 4. .env check
# ---------------------------------------------------------------------------
if [ ! -f "$BACKEND_DIR/.env" ]; then
  echo ""
  echo "  !! No .env found in backend/. Copy your secrets before starting:"
  echo "     scp -i ~/your-key.pem backend/.env ec2-user@<IP>:~/fridge-chef/backend/.env"
  echo "  Then re-run: bash backend/setup_ec2.sh"
  echo ""
  exit 1
fi

# ---------------------------------------------------------------------------
# 5. Ingest the default PDF into ChromaDB (only if chroma_store doesn't exist)
# ---------------------------------------------------------------------------
if [ ! -d "$REPO_DIR/chroma_store" ]; then
  echo "==> Ingesting default cookbook PDF into ChromaDB"
  cd "$BACKEND_DIR"
  poetry run python rag.py
else
  echo "==> chroma_store already exists, skipping ingestion"
fi

# ---------------------------------------------------------------------------
# 6. Start FastAPI server and LiveKit agent as background processes
# ---------------------------------------------------------------------------
echo "==> Starting FastAPI server on port 8000"
cd "$BACKEND_DIR"
nohup poetry run uvicorn server:app --host 0.0.0.0 --port 8000 > /tmp/fridge-chef-server.log 2>&1 &
echo "    PID $! — logs: tail -f /tmp/fridge-chef-server.log"

sleep 2  # give uvicorn a moment before the agent tries to connect

echo "==> Starting LiveKit voice agent"
nohup poetry run python agent.py start > /tmp/fridge-chef-agent.log 2>&1 &
echo "    PID $! — logs: tail -f /tmp/fridge-chef-agent.log"

echo ""
echo "Done. Both processes are running."
echo "Test the server: curl http://localhost:8000/docs"
