#!/bin/bash
# Stop hub API and worker started by scripts/hub-up.sh.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PID_DIR="$ROOT/.pids"

kill_pidfile() {
    local name=$1
    local file=$2
    if [ -f "$file" ]; then
        local pid
        pid=$(cat "$file")
        if kill -0 "$pid" 2>/dev/null; then
            echo "Stopping $name (PID $pid)..."
            kill "$pid" 2>/dev/null || true
            sleep 1
            kill -9 "$pid" 2>/dev/null || true
        fi
        rm -f "$file"
    fi
}

kill_pidfile hub "$PID_DIR/hub.pid"
kill_pidfile worker "$PID_DIR/worker.pid"

# Child python from start.sh
if command -v lsof >/dev/null; then
    PIDS=$(lsof -ti:8000,6000 2>/dev/null || true)
    if [ -n "$PIDS" ]; then
        echo "Stopping processes on hub ports 8000/6000: $PIDS"
        kill $PIDS 2>/dev/null || true
    fi
fi

echo "hub stopped"
