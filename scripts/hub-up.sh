#!/bin/bash
# Start hub API + worker. Run pnpm dev:hub in another terminal for the console.

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

mkdir -p "$ROOT/data" "$ROOT/.pids"

if [ -f "$ROOT/.pids/hub.pid" ] && kill -0 "$(cat "$ROOT/.pids/hub.pid")" 2>/dev/null; then
    echo "hub API already running (PID $(cat "$ROOT/.pids/hub.pid"))"
else
    nohup bash "$ROOT/hub/start.sh" > "$ROOT/data/hub-startup.log" 2>&1 &
    echo $! > "$ROOT/.pids/hub.pid"
    echo "hub API PID $(cat "$ROOT/.pids/hub.pid")  (log: data/hub-startup.log)"
fi

for _ in 1 2 3 4 5 6 7 8 9 10; do
    if command -v curl >/dev/null && curl -sf http://127.0.0.1:8000/health >/dev/null 2>&1; then
        break
    fi
    sleep 1
done

if [ -f "$ROOT/.pids/worker.pid" ] && kill -0 "$(cat "$ROOT/.pids/worker.pid")" 2>/dev/null; then
    echo "worker already running (PID $(cat "$ROOT/.pids/worker.pid"))"
else
    nohup bash "$ROOT/scripts/hub-worker.sh" > "$ROOT/data/worker-startup.log" 2>&1 &
    echo $! > "$ROOT/.pids/worker.pid"
    echo "worker PID $(cat "$ROOT/.pids/worker.pid")  (log: data/worker-startup.log)"
fi

echo ""
echo "Console:  ./scripts/dev-hub.sh     http://127.0.0.1:3000"
echo "Stop hub: ./scripts/hub-down.sh"
