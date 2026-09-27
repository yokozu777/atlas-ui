# First Login and Admin Password

This guide explains how to log in for the first time and how to change the admin password.

---

## First login

On first run, atlas-ui creates an `admin` user.

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `admin` |

1. Open the console (http://localhost:3000).
2. Enter **admin** / **admin**.
3. Click **Sign in**.

The Sign in page shows this default only while the bootstrap password is still in use. You are then sent to **/change-password**. Change it before using the rest of the UI. After the password is changed, the hint on Sign in disappears.

---

## Changing the password

### Via the UI

1. Sign in as admin.
2. Open **/change-password** (or follow the prompt after first login).
3. Enter the current password, a new password (at least 6 characters), and confirmation.
4. Submit.

---

## Choosing the initial password yourself

Set `ATLAS_ADMIN_PASSWORD` in `.env` **before** the first hub start to skip `admin` / `admin` and the forced change (used in CI).

If the admin user already exists, changing that env var does not reset the password. Use **/change-password** while signed in.

Older hub images wrote a random bootstrap password into `data/auth/users.json` and `data/auth/admin-initial.txt`. A later rebuild keeps `./data`, so `admin` / `admin` would fail until you used that file. Current hub start resets that leftover bootstrap password to `admin` / `admin` **only while** the forced change is still pending, then deletes `admin-initial.txt`. After you have already changed the password, the hub does not reset it.

---

## Lost password

atlas-ui does not ship a password-reset script in the Docker images.

If you still have a session, change the password in the UI.

If you cannot sign in and this is a lab instance you are willing to re-bootstrap:

1. Stop the stack.
2. Back up `./data` if you need projects.
3. Remove or recreate the hub user store under `data/auth/` (users, not necessarily JWT/encryption keys).
4. Start again so `admin` is seeded with `admin` / `admin` (or `ATLAS_ADMIN_PASSWORD`).

Treat that as a lab recovery path, not production IAM.
