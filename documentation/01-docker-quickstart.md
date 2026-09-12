# Docker Quick Start

This guide explains how to run atlas-ui using Docker Compose on Linux, macOS, and Windows (Docker Desktop).

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)
- Git (Settings → Clone, or a local `git clone`)
- Host paths for inventory/workspace and an SSH private key file
- Docker Desktop: enable file sharing for those host folders (typically `C:\Users` / `/Users`)

atlas-ui is three containers:

| Service | Image | Port |
|---------|-------|------|
| Console | `yokozu/atlas-ui` | http://localhost:3000 |
| Hub API | `yokozu/atlas-ui-hub` | http://localhost:8000 |
| Worker | `yokozu/atlas-ui-worker` | compose network; talks to hub at `http://hub:8000` |

---

## Environment file

Copy the example and set **host** paths (Linux `/home/…`, macOS `/Users/…`, Windows `C:\Users\…`). Compose bind-mounts them at POSIX targets inside hub and worker:

| `.env` (host source) | Inside containers |
|----------------------|-------------------|
| `ATLAS_CLUSTER_ROOT` | `/atlas/clusterctl` |
| `ATLAS_CLUSTERS_ROOT` | `/atlas/clusters` |
| `ATLAS_WORKSPACE_ROOT` | `/atlas/workspace` |
| `SSH_KEY` | `/atlas/ssh/id_rsa` |

The worker mounts `/var/run/docker.sock`. clusterctl with `execution.mode: docker` starts krang on the **host** daemon and remaps `/atlas/…` to the daemon bind Source (container inspect, or `ATLAS_*_ROOT_HOST`). You do not need 1:1 `hostPath:hostPath` mounts.

Leave **Project Settings** inventory/workspace empty when using Compose so hub uses `/atlas/…`. Stale host paths saved from an older Linux 1:1 setup are ignored when those directories do not exist inside the container.

```bash
cp .env.example .env
```

Required variables:

| Variable | Meaning |
|----------|---------|
| `ATLAS_CLUSTERS_ROOT` | Host path to the inventory clusters tree (for example `…/atlas-inventory/clusters`) |
| `ATLAS_WORKSPACE_ROOT` | Host path to the workspace tree (for example `…/atlas-inventory/workspace`) |
| `SSH_KEY` | Host path to an SSH private key, mounted read-only on the worker at `/atlas/ssh/id_rsa` |

Optional:

| Variable | Meaning |
|----------|---------|
| `ATLAS_CLUSTERCTL_GIT_URL` | Public atlas-clusterctl remote (default `https://github.com/yokozu777/atlas-clusterctl.git`) |
| `ATLAS_CLUSTER_ROOT` | Host checkout directory. Unset = `<compose project dir>/atlas-clusterctl` (Docker creates the folder on first `up`). Do not put a Git URL here — it is a bind-mount **source**. |
| `ATLAS_ADMIN_PASSWORD` | Skip the one-time password file (see [02-first-login-admin.md](02-first-login-admin.md)) |
| `ATLAS_UI_IMAGE_TAG` | Pin Hub images (`latest` by default) |
| `WORKER_SERVER_URL` | Worker → hub URL (default `http://hub:8000`). Do not use `host.docker.internal` or `127.0.0.1` unless you also set worker `network_mode: host`. |
| `JWT_SECRET_KEY` / `GLOBAL_SECRETS_ENCRYPTION_KEY` | Persist across hosts; otherwise hub writes files under `data/auth/` |

After the stack is up, open **Settings → Local / clusterctl** and use **Clone** (or `git clone` into the host folder mounted at `/atlas/clusterctl`). The Clone dest inside Docker is `/atlas/clusterctl`. **Pull** fast-forwards an existing checkout.

Do **not** set `CLUSTER_EXECUTOR_FORCE_LOCAL` on hub or worker. clusterctl sets that flag only inside the executor container it starts.

Linux labs that must use host networking can set worker `network_mode: host` and `WORKER_SERVER_URL=http://127.0.0.1:8000`.

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

If the UI container exits with `Cannot find module 'next'` (`/app/server.js`), the image is a stale Hub `standalone` build. Use **Option 2** (`docker compose up -d --build`) so the runner image contains a hoisted `node_modules/next`. Do not use `docker compose -f docker-compose.hub.yml` until that tag is republished.

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
| Compose `worker` | ansible inside the worker image | docker CLI + `/var/run/docker.sock`; krang bind sources are host paths |
| Host `./scripts/hub-worker.sh` | ansible on the host | `docker run` on the host (1:1 paths) |

Inside Compose, clusterctl sees `/atlas/clusterctl`, `/atlas/clusters`, `/atlas/workspace`, and `SSH_KEY=/atlas/ssh/id_rsa`. The host daemon receives the `.env` paths (or Docker Desktop `/run/desktop/mnt/host/…`) as `-v` sources.
