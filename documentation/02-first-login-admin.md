# First Login and Admin Password

This guide explains how to log in for the first time and how to change the admin password.

---

## First login

On first run, atlas-ui creates an `admin` user.

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | One-time value in `data/auth/admin-initial.txt` (mode 0600), unless `ATLAS_ADMIN_PASSWORD` was set before the hub started |

1. Open the console (http://localhost:3000).
2. Enter **admin** as username.
3. Paste the password from `data/auth/admin-initial.txt` (or the value you set in `ATLAS_ADMIN_PASSWORD`).
4. Click **Sign in**.

If the hub required a password change, you are sent to **/change-password**. Change it before using the rest of the UI.

**Do not** commit `data/auth/admin-initial.txt` or put a live password in git.

---

## Changing the password

### Via the UI

1. Sign in as admin.
2. Open **/change-password** (or follow the prompt after first login).
3. Enter the current password, a new password, and confirmation.
4. Submit.

There is no hardcoded default such as `admin123`.

---

## Choosing the initial password yourself

Set `ATLAS_ADMIN_PASSWORD` in `.env` **before** the first hub start. The hub then skips writing `admin-initial.txt`.

If the admin user already exists, changing that env var does not reset the password. Use **/change-password** while signed in.

---

## Lost password

atlas-ui does not ship a password-reset script in the Docker images.

If you still have a session, change the password in the UI.

If you cannot sign in and this is a lab instance you are willing to re-bootstrap:

1. Stop the stack.
2. Back up `./data` if you need projects.
3. Remove or recreate the hub user store under `data/auth/` (users, not necessarily JWT/encryption keys).
4. Start again so `admin` is seeded with a new `admin-initial.txt` or `ATLAS_ADMIN_PASSWORD`.

Treat that as a lab recovery path, not production IAM.
