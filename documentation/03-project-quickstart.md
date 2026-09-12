# Project Quick Start

Quick guide to creating a project and running work. Kind is **immutable** after create: `ansible` (playbooks) or `atlas` (clusterctl).

**Prerequisites:** atlas-ui is running and you are signed in. For `atlas` projects, inventory must be reachable: Compose uses `/atlas/clusterctl`, `/atlas/clusters`, and `/atlas/workspace` (host paths belong in `.env` only). See [01-docker-quickstart.md](01-docker-quickstart.md).

---

## 1. Create a project

1. Open **Projects**.
2. Click **New project**.
3. Enter a **Name** (description optional).
4. Choose **Kind**:
   - **Ansible** — playbooks, inventory, Git sources, scheduler.
   - **Atlas** — clusterctl cluster. Set **Cluster id** to an inventory leaf such as `dev/k8s`. No Ansible repo skeleton is created.
5. Click **Create**.

Home is `/projects`. Opening a project lands on **Dashboard** (ansible) or **Overview** (atlas).

---

## 2. Ansible project

Git details: [04-repository-structure-git-sync.md](04-repository-structure-git-sync.md).

1. **Secrets** — store SSH keys used for Git and host connections.
2. **Project Settings → Sources** — Git URL, branch, auth; **Test**, then **Pull**.
3. **Hosts & Groups** — pick inventory files, bind SSH secrets, optionally **Check**.
4. **Playbooks** — open a playbook, set targets/options, **Run**. The job is claimed by a worker; follow it under **Runs** / **Executions**.
5. Optional: **Schedule** (cron on the hub worker), **Vaults**, **Users**.

Visual playbook builder and a separate “visual role configurator” are not required: edit YAML in the UI, preview, and run.

---

## 3. Atlas project

1. Confirm the cluster in the header switcher (for example `dev/k8s`).
2. **Overview** — plan, phases, host count, last activity. **Plan** / **Validate** / **Smoke** inspect; **Run** queues on the worker.
3. **Cluster definition → Repos** — playbook repos from `cluster.yaml`. **Sync** / **Sync all** (lock SHA is shown when `playbooks.lock` has that repo). Assign a **Git pull key** (project default or per-repo) from **Secrets**.
4. **Hosts & Groups** / **Vars** / **Logs** — inventory and run history for the selected cluster.
5. **Run** — phases, tags, limit, extra vars, dry-run, executor `local` or `docker`. **Advanced → Executor** overrides `cluster.yaml`. `--root-ssh` needs permission `atlas.execute_root_ssh` (not granted by `atlas.execute` alone).
6. **Init** lives under the atlas project, not next to Projects.

Hub inspect uses the clusterctl checkout plus the inventory leaf (`/atlas/…` in Docker). Vars save is read-only on hub. Mutating jobs (`run`, `init`, `repos sync`, `workspace reset`) are single-flight.

---

## Summary

| Step | Where | Action |
|------|-------|--------|
| 1 | Projects | Create project (`ansible` or `atlas`) |
| 2a | Ansible: Settings → Sources, Hosts, Playbooks | Pull Git, bind SSH, Run |
| 2b | Atlas: Overview, Cluster definition, Run | Pick cluster, sync repos, Queue on worker |
| 3 | Runs / Logs / Workers | Watch execution; scale workers under Settings → Workers |
