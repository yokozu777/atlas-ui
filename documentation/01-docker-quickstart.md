# Docker Quick Start

This guide explains how to run atlas-ui using Docker Compose on Linux, macOS, and Windows (Docker Desktop).

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)
- Git (Settings → Clone, or a local `git clone`)
- Host path to the atlas-inventory repo (`ATLAS_INVENTORY`). SSH for clusterctl belongs in **System / Secrets Manager** (paste or generate). Do not set `SSH_KEY` in `.env`.
- Docker Desktop: enable file sharing for those host folders (typically `C:\Users` / `/Users`)

atlas-ui is three containers:

| Service | Image | Port |
|---------|-------|------|
| Console | `yokozu/atlas-ui` | http://localhost:3000 |
| Hub API | `yokozu/atlas-ui-hub` | http://localhost:8000 |
| Worker | `yokozu/atlas-ui-worker` | compose network; talks to hub at `http://hub:8000` |

The console image is Distroless Node (no shell, apt, or git). `docker exec` into `atlas-ui` is not useful — use `docker compose logs ui`, or rebuild the runner `FROM gcr.io/distroless/nodejs22-debian13:debug`. Hub and worker stay on Debian slim because they need git, ansible, ssh, and bash.

---

## Environment file

Copy the example and set **one** host path: the atlas-inventory repo (Linux `/home/…`, macOS `/Users/…`, Windows `C:\Users\…`). Compose derives clusters and workspace from it:

| Host (from `.env`) | Inside hub / worker |
|--------------------|---------------------|
| `$ATLAS_INVENTORY/clusters` | `/atlas/clusters` |
| `$ATLAS_INVENTORY/workspace` | `/atlas/workspace` |
| `$ATLAS_CLUSTER_ROOT` (optional) | `/atlas/clusterctl` |

The worker mounts `/var/run/docker.sock`. clusterctl with `execution.mode: docker` starts krang on the **host** daemon and remaps `/atlas/…` to the daemon bind Source (`ATLAS_*_ROOT_HOST`). You do not need 1:1 `hostPath:hostPath` mounts.

Leave **Project Settings** inventory and workspace **empty** when using Compose. Hub then uses `/atlas/…`. A leftover host path (`/home/…/atlas-inventory/clusters`) does not exist inside the container, so every cluster shows as **missing**.

```bash
cp .env.example .env
```

Required:

| Variable | Meaning |
|----------|---------|
| `ATLAS_INVENTORY` | Absolute host path to the atlas-inventory repo. Compose fails if this is unset (empty bind is not silent). |

Optional:

| Variable | Meaning |
|----------|---------|
| `ATLAS_CLUSTER_ROOT` | Host checkout of atlas-clusterctl. Unset = `<compose project dir>/atlas-clusterctl`. Do not put a Git URL here — it is a bind-mount **source**. |
| `ATLAS_UI_IMAGE_TAG` | Pin published images (`latest` by default) |
| `ATLAS_ADMIN_PASSWORD` | Optional override for the first admin password (CI). Unset = `admin` / `admin` with a forced password change (see [02-first-login-admin.md](02-first-login-admin.md)) |
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
cp .env.example .env   # ATLAS_INVENTORY; SSH key via Secrets Manager
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

If the UI container exits with `Cannot find module 'next'`, the image is a stale Hub build from before webpack standalone. Use **Option 2** (`docker compose up -d --build`) so the runner contains a traced `server.js` plus `next`. Do not use `docker compose -f docker-compose.hub.yml` until that tag is republished.

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

Keep `data/` and `.env` off git. They are gitignored.

---

## Worker and clusterctl executors

| Worker | clusterctl `local` | clusterctl `docker` |
|--------|--------------------|---------------------|
| Compose `worker` | ansible inside the worker image | docker CLI + `/var/run/docker.sock`; krang bind sources are host paths |
| Host `./scripts/hub-worker.sh` | ansible on the host | `docker run` on the host (1:1 paths) |

Inside Compose, clusterctl sees `/atlas/clusterctl`, `/atlas/clusters`, and `/atlas/workspace`. Atlas-ui injects the Secrets Manager clusterctl SSH key as `SSH_KEY` at run time. The host daemon receives `$ATLAS_INVENTORY/{clusters,workspace}` (or Docker Desktop `/run/desktop/mnt/host/…`) as `-v` sources. Add the key in the UI under **System / Secrets Manager** (or when Apply asks after init).
