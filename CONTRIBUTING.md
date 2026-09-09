# Contributing

Lab-oriented Linux workflow. Hub API and worker live in `hub/`.

## Run locally

```bash
./scripts/hub-up.sh      # FastAPI :8000 + worker
./scripts/dev-hub.sh     # http://127.0.0.1:3000
```

First-run admin password is written to `data/auth/admin-initial.txt` (mode 0600) unless `ATLAS_ADMIN_PASSWORD` is set. JWT and encryption keys are created the same way under `data/auth/` when those env vars are empty.

Without hub (local clusterctl only, no login): `./scripts/dev.sh`.

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
