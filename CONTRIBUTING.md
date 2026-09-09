# Contributing

Lab-oriented Linux workflow. The control plane lives in `hub/` (FastAPI + worker). The console is Next.js in this repo.

Public operator docs (Docker Hub compose, first login, projects, Git): [documentation/README.md](documentation/README.md).

## Requirements

- Node.js 22+ (pnpm)
- Python 3.11+ (hub API/worker)
- A local atlas-clusterctl clone (`../atlas-clusterctl`) for `kind=atlas` inspect/run
- Linux controller host

## Run locally (hub + console)

```bash
cd atlas-ui
./scripts/hub-up.sh          # FastAPI :8000 + worker
./scripts/dev-hub.sh         # http://127.0.0.1:3000
```

First login: username `admin`. If `ATLAS_ADMIN_PASSWORD` is unset, the one-time password is in `data/auth/admin-initial.txt` (mode 0600) and must be changed after sign-in. JWT and encryption keys are written once under `data/auth/` when `JWT_SECRET_KEY` / `GLOBAL_SECRETS_ENCRYPTION_KEY` are empty.

Node is picked up from `~/.local/node/bin` if `pnpm` is not on PATH. Stop hub: `./scripts/hub-down.sh`.

**Local clusterctl** (`pnpm dev` without hub): binds **127.0.0.1**. Local `/api/jobs` spawn is never mixed with worker executions.

```bash
./scripts/dev.sh          # http://127.0.0.1:3000
```

First screen without hub: path to the clusterctl checkout (`./cluster --version`). Saved in `~/.config/atlas-ui/config.json`. Default: env `ATLAS_CLUSTER_ROOT`.

```bash
pnpm build
pnpm start
```

Docker from this checkout: `cp .env.example .env` then `docker compose up -d --build`. Pre-built images: `docker compose -f docker-compose.hub.yml up -d` — see [documentation/01-docker-quickstart.md](documentation/01-docker-quickstart.md).

## Tests

Hub (Python 3.12):

```bash
cd hub
python3 -m venv venv && ./venv/bin/pip install -r requirements.txt -r worker/requirements.txt
./venv/bin/python -m unittest discover -s tests -v
```

From the repo root: `python -m unittest discover -s hub/tests -v` (needs hub dependencies on `PYTHONPATH`).

Console:

```bash
pnpm lint
pnpm build
```

## Smoke

1. Open `/` — it redirects to **Projects**. Log in if hub is running (`admin` + password from `data/auth/admin-initial.txt` or `ATLAS_ADMIN_PASSWORD`).
2. **New project** → `ansible`: Open → **Secrets** → **Hosts** (inventory, add host, bind SSH, Import/Export ZIP) → **Settings → Sources** (Test, Sync, autosync) → **Playbooks** (Run, SSE). Optional: **Schedule**, **Vaults**, **Users**.
3. **New project** → `atlas` with cluster id (e.g. `dev/k8s`): Open → **Overview** → **Hosts / Vars / Logs**. **Run** queues on the worker when hub is up (Advanced: executor local/docker, dry-run, root-ssh).
   - Hub: Overview/Vars/Hosts/Logs use `POST /atlas/inspect` on the API host (`ATLAS_CLUSTER_ROOT` + inventory leaf). Vars save is **read-only on hub**.
   - Without hub: local `/api/jobs` spawn only.
4. Ansible **Hosts → Check** queues `POST /check_host` and streams the worker log. Playbook **Run**, atlas **Queue on worker**, secrets, vault, git, roles YAML, users, permissions, and workers (create/rotate token) go through the hub API. **Settings**: Archive / Restore / Delete.
5. Init is under the atlas project, not next to Projects.

Hub Run and local jobs stay separate lists.

## CLI mapping (atlas projects)

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

See also [SECURITY.md](SECURITY.md).
