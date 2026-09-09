# atlas-ui

Alpha/lab console for **projects**. Each project has an immutable **kind**: `atlas` (clusterctl) or `ansible` (playbooks). Home is `/projects`. Linux controller host, bind-mounts for Atlas trees.

The control plane lives in this repo under **`hub/`** (FastAPI + worker). A separate StarGate checkout is not required.

**Local clusterctl** (`pnpm dev` without hub): binds **127.0.0.1**. Local `/api/jobs` spawn is never mixed with worker executions.

**Hub mode:** `./scripts/hub-up.sh`, then `./scripts/dev-hub.sh` (login cookie, BFF `/api/hub/*`). Hub API listens on **:8000** (port 6000 is blocked as a “bad port” in browsers).

## Requirements

- Node.js 22+ (pnpm)
- Python 3.11+ (hub API/worker)
- A local atlas-clusterctl clone (`../atlas-clusterctl`) for `kind=atlas` inspect/run
- Linux controller host

## Run (hub + console)

```bash
cd atlas-ui
./scripts/hub-up.sh          # FastAPI :8000 + worker
./scripts/dev-hub.sh         # http://127.0.0.1:3000
```

First login: username `admin`. If `ATLAS_ADMIN_PASSWORD` is unset, the one-time password is in `data/auth/admin-initial.txt` (mode 0600) and must be changed after sign-in. JWT and encryption keys are written once under `data/auth/` when `JWT_SECRET_KEY` / `GLOBAL_SECRETS_ENCRYPTION_KEY` are empty.

Node is picked up from `~/.local/node/bin` if `pnpm` is not on PATH. Stop hub: `./scripts/hub-down.sh`.

Docker (API + worker + UI):

```bash
cp .env.example .env   # set absolute ATLAS_* and SSH_KEY
docker compose up -d --build
```

Open **http://localhost:3000**. Hub API: http://localhost:8000.

Atlas trees are bind-mounted at the **same host path** inside hub and worker (not remapped to `/opt/…`). That is required for `execution.mode: docker`: clusterctl bind-mounts those paths into the executor image via the host Docker daemon (`/var/run/docker.sock` on the worker). Do **not** set `CLUSTER_EXECUTOR_FORCE_LOCAL` on the worker — clusterctl sets that only inside the executor container.

| Worker | clusterctl `local` | clusterctl `docker` |
|--------|--------------------|---------------------|
| Host `./scripts/hub-worker.sh` | ansible on the host | `docker run` on the host |
| Compose `worker` | ansible in the worker image | docker CLI + sock; host paths must match |

`ATLAS_CLUSTER_ROOT` (clusterctl checkout with `./cluster`), `ATLAS_CLUSTERS_ROOT`, `ATLAS_WORKSPACE_ROOT`, and `SSH_KEY` must be readable at those paths on the worker. Host worker: if `ATLAS_CLUSTER_ROOT` is unset, `hub-worker.sh` uses `../atlas-clusterctl` when `./cluster` exists. Paths also come from `{ATLAS_CLUSTER_ROOT}/.config/config.yaml` when env/project fields are empty.

Run **Advanced → Executor**: cluster default (`cluster.yaml`), or override `--executor local|docker`.

Without hub (clusterctl-only, no login):

```bash
./scripts/dev.sh          # http://127.0.0.1:3000
```

First screen without hub: path to the clusterctl checkout (`./cluster --version`). Saved in `~/.config/atlas-ui/config.json`. Default: env `ATLAS_CLUSTER_ROOT`.

```bash
pnpm build
pnpm start
```

Hub tests:

```bash
cd hub
python3 -m venv venv && ./venv/bin/pip install -r requirements.txt -r worker/requirements.txt
./venv/bin/python -m unittest discover -s tests -v
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`SECURITY.md`](SECURITY.md).

## Smoke

1. Open `/` — it redirects to **Projects**. Log in if hub is running (`admin` + password from `data/auth/admin-initial.txt` or `ATLAS_ADMIN_PASSWORD`).
2. **New project** → `ansible`: Open → **Secrets** → **Hosts** (inventory, add host, bind SSH, Import/Export ZIP) → **Git** (Test, Sync, autosync) → **Playbooks** (Run, SSE). Optional: **Schedule**, **Vaults** (keys, snippet encrypt, vault files), **Users** / permissions.
3. **New project** → `atlas` with cluster id (e.g. `dev/k8s`): Open → **Overview** → **Hosts / Vars / Logs**. **Run** queues on the worker when hub is up (Advanced: executor local/docker, dry-run, root-ssh).
   - Hub: Overview/Vars/Hosts/Logs use `POST /atlas/inspect` on the API host (`ATLAS_CLUSTER_ROOT` + inventory leaf). Vars save is **read-only on hub**. Init / repos sync / workspace reset stay local-only.
   - Without hub: local `/api/jobs` spawn only.
4. Ansible **Hosts → Check** queues `POST /check_host` and streams the worker log. Playbook **Run**, atlas **Queue on worker**, secrets, vault, git, roles YAML, users, permissions, and workers (create/rotate token) go through the hub API. Visual Role Configurator is not in the product. **Settings**: Archive / Restore / Delete.
5. Init is under the atlas project (**More → Init**), not next to Projects.

Hub Run and local jobs stay separate lists.

## CLI mapping

| UI | `./cluster` |
|----|-------------|
| Clusters | `list --json`, `use` |
| Init | `init --template` / `--from` / `--dns-suffix` / `--force` |
| Overview | `plan --json`, `stages --json`, `validate --json`, `smoke --json` |
| Run | `run --phases` `--tags` `--limit` `-e` `--root-ssh` `--git-ssh` `--dry-run` `--executor` |
| Repos | `repos status --json`, `repos sync`, `repos show` |
| Logs | `workspace/…/logs/<stamp>/run.log` |
| Config | `config show --json`, `config effective --json` |
| Workspace | `workspace show --json`, `workspace id`, `workspace reset --yes` |

Mutating jobs (`run`, `init`, `repos sync`, `workspace reset`) are **single-flight**. Cancel sends SIGTERM to the process group; Ansible children may outlive the wrapper.

Secrets files (`atlas-*.secrets.yml`) are not opened in the UI.

`--root-ssh` requires `atlas.execute_root_ssh` (not granted by `atlas.execute` alone).

## License

Apache-2.0 — [`LICENSE`](LICENSE)
