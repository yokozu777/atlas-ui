# Docker Quick Start

This guide explains how to run atlas-ui using Docker Compose.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)
- A Linux controller host (the worker uses the host Docker daemon and bind-mounted paths)
- Git (for clone / local build)
- Absolute host paths for inventory/workspace and an SSH private key file
- Git (Settings → Clone, or a local `git clone`)

atlas-ui is three containers:

| Service | Image | Port |
|---------|-------|------|
| Console | `yokozu/atlas-ui` | http://localhost:3000 |
| Hub API | `yokozu/atlas-ui-hub` | http://localhost:8000 |
| Worker | `yokozu/atlas-ui-worker` | host network; talks to hub on `:8000` |

---

## Environment file

Copy the example and set **absolute** host paths. Compose bind-mounts them at the **same path** inside hub and worker (not remapped to `/opt/…`). That is required when clusterctl runs with `execution.mode: docker`: the executor container is started by the **host** Docker daemon (`/var/run/docker.sock` on the worker), which only sees host paths.

```bash
cp .env.example .env
```

Required variables:

| Variable | Meaning |
|----------|---------|
| `ATLAS_CLUSTERS_ROOT` | Inventory clusters tree (for example `…/atlas-inventory/clusters`) |
| `ATLAS_WORKSPACE_ROOT` | Workspace tree (for example `…/atlas-inventory/workspace`) |
| `SSH_KEY` | Host path to an SSH private key, mounted read-only on the worker |

Optional:

| Variable | Meaning |
|----------|---------|
| `ATLAS_CLUSTERCTL_GIT_URL` | Public atlas-clusterctl remote (default `https://github.com/yokozu777/atlas-clusterctl.git`) |
| `ATLAS_CLUSTER_ROOT` | Checkout directory. Unset = `<compose project dir>/atlas-clusterctl` (Docker creates the folder on first `up`). Do not put a Git URL here — it is a bind-mount path. |
| `ATLAS_ADMIN_PASSWORD` | Skip the one-time password file (see [02-first-login-admin.md](02-first-login-admin.md)) |
| `ATLAS_UI_IMAGE_TAG` | Pin Hub images (`latest` by default) |
| `WORKER_SERVER_URL` | Worker → hub URL (default `http://127.0.0.1:8000`) |
| `JWT_SECRET_KEY` / `GLOBAL_SECRETS_ENCRYPTION_KEY` | Persist across hosts; otherwise hub writes files under `data/auth/` |

After the stack is up, open **Settings → Local / clusterctl** and use **Clone** (or `git clone` into `./atlas-clusterctl`). **Pull** fast-forwards an existing checkout. A sibling checkout under `/home/you/git/…` is optional.

Do **not** set `CLUSTER_EXECUTOR_FORCE_LOCAL` on hub or worker. clusterctl sets that flag only inside the executor container it starts.

---

## Option 1: Pre-built images (Docker Hub)

Fastest way to run atlas-ui — pull images from Docker Hub.

### 1. Clone the repository

```bash
git clone git@github.com:yokozu777/atlas-ui.git
cd atlas-ui
cp .env.example .env   # inventory, workspace, SSH_KEY; clusterctl defaults to ./atlas-clusterctl
```

### 2. Start the stack

```bash
docker compose -f docker-compose.hub.yml pull
docker compose -f docker-compose.hub.yml up -d
```

Pin a release:

```bash
ATLAS_UI_IMAGE_TAG=2026-09-09 docker compose -f docker-compose.hub.yml up -d
```

### 3. Access the application

- **Web UI:** http://localhost:3000
- **Hub API:** http://localhost:8000

---

## Option 2: Local build (from source)

Use this when you have the repository and want to build images locally.

```bash
git clone git@github.com:yokozu777/atlas-ui.git
cd atlas-ui
cp .env.example .env
docker compose up -d --build
```

Access is the same: UI on **:3000**, API on **:8000**.

---

## Common commands

| Action | Hub images | Local build |
|--------|------------|-------------|
| Start in background | `docker compose -f docker-compose.hub.yml up -d` | `docker compose up -d` |
| View logs | `docker compose -f docker-compose.hub.yml logs -f` | `docker compose logs -f` |
| Stop | `docker compose -f docker-compose.hub.yml down` | `docker compose down` |
| Rebuild and start | — | `docker compose up -d --build` |

---

## Data persistence

Persistent hub data is stored in `./data` on the host:

- Projects, inventory copies, playbooks, executions
- Worker registration token
- JWT and encryption keys under `data/auth/`
- One-time admin password file `data/auth/admin-initial.txt` (mode 0600) when `ATLAS_ADMIN_PASSWORD` is unset

Keep `data/` and `.env` off git. They are gitignored.

---

## Worker and clusterctl executors

| Worker | clusterctl `local` | clusterctl `docker` |
|--------|--------------------|---------------------|
| Compose `worker` | ansible inside the worker image | docker CLI + sock; host paths must match |
| Host `./scripts/hub-worker.sh` | ansible on the host | `docker run` on the host |

`ATLAS_CLUSTER_ROOT` (default `<compose dir>/atlas-clusterctl`), `ATLAS_CLUSTERS_ROOT`, `ATLAS_WORKSPACE_ROOT`, and `SSH_KEY` must be readable at those paths on the worker.
