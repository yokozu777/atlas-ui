# Git repositories and sync

This guide covers how atlas-ui attaches Git to **ansible** projects and how **atlas** projects sync playbook repos from `cluster.yaml`.

Vault passwords, SSH private keys, and other secrets stay in the hub (`./data`). Encrypted vault *files* may live in Git; keys do not.

---

## Ansible projects

### What gets synced

Typical layout in the Git repo attached as a **Source**:

```
your-ansible-repo/
├── playbooks/
│   └── site.yml
├── roles/
│   └── common/
├── inventories/
│   ├── inventory.yml
│   ├── prod/
│   │   ├── inventory.yml
│   │   ├── group_vars/
│   │   └── host_vars/
│   └── dev/
│       ├── inventory.yml
│       ├── group_vars/
│       └── host_vars/
├── vars/              # optional
└── ansible.cfg        # optional
```

Root-level files such as `ansible.cfg` are included. Inventory file names commonly used: `inventory.yml`, `inventory.yaml`, `hosts.yml`, `hosts.yaml`, `hosts`, `hosts.ini`.

### Connect Git

1. Open the ansible project → **Project Settings**.
2. Configure **Sources** (Git URL, branch, authentication).
3. **Test connection**, then **Pull** (or enable autosync).
4. Playbooks, roles, and inventories appear under **Playbooks**, **Roles**, and **Hosts & Groups**.

SSH keys for private repos: create a secret of type `ssh_key` / `git_ssh_key` under **Secrets** (project or global), then select it on the source.

### Vault

Encrypted files (for example `group_vars/all/vault.yml`) can live in Git. Vault keys and snippet encryption stay in atlas-ui (**Vaults**). Do not put vault passwords in the repository.

---

## Atlas projects

Playbook repositories are declared in **cluster.yaml**, not as a single project-level Git source.

1. Open **Cluster definition → YAML** to edit `playbooks:` entries (url, ref, entries).
2. Open **Repos** to see origin, ref, sync policy, HEAD, and **lock SHA** (only for repos present in `playbooks.lock`).
3. **Git pull key** — project default and optional per-repo key. Keys come from **Secrets** (`ssh_key` / `git_ssh_key`). Worker env injects `GIT_SSH_COMMAND` / `PLAYBOOKS_*_SSH_KEY` for sync and run.
4. **Sync** one repo or **Sync all**. That clones under `{workspace}/{cluster_id}/repos/<name>` (clusterctl layout). Role Settings and the playbook editor read those clones.

Example `playbooks:` shape (names vary per cluster):

```yaml
playbooks:
  - name: atlas-k8s-core
    url: git@git.example.com:org/atlas-k8s-core.git
    ref: main
    sync: always
    entries:
      - cluster
```

After sync, **Roles** lists roles from those clones; **Role Settings** in the sidebar edits defaults for a selected role. That is YAML in the UI, not a separate visual role designer.

---

## Secrets vs Git

| Stored in Git | Stored only in atlas-ui |
|---------------|-------------------------|
| Playbooks, roles, inventory YAML | SSH private keys |
| Encrypted vault files | Vault passwords / encryption keys |
| `cluster.yaml` / lock files (inventory repo) | JWT, hub encryption key, worker tokens |

Never commit `.env`, `data/`, or `admin-initial.txt`.
