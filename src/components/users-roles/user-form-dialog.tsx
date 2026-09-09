"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Save } from "lucide-react";
import { toast } from "sonner";

import {
  isValidEmail,
  isValidPassword,
  isValidUsername,
  type RoleRow,
  type UserRow,
} from "@/components/users-roles/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { stargateJson } from "@/lib/stargate";

export function UserFormDialog({
  open,
  onOpenChange,
  mode,
  user,
  roles,
  isSelf,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  user?: UserRow | null;
  roles: RoleRow[];
  isSelf: boolean;
  onSaved: () => Promise<void> | void;
}) {
  const isEdit = mode === "edit";
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [setPasswordOnEdit, setSetPasswordOnEdit] = useState(false);
  const [active, setActive] = useState(true);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUsername(user?.username || "");
    setEmail(user?.email || "");
    setPassword("");
    setShowPassword(false);
    setSetPasswordOnEdit(false);
    setActive(user?.is_active !== false);
    setRoleIds(user?.roles ?? []);
  }, [open, user]);

  function toggleRole(id: string, checked: boolean) {
    setRoleIds((current) =>
      checked ? [...current, id] : current.filter((item) => item !== id),
    );
  }

  async function submit() {
    const trimmed = username.trim();
    if (!isValidUsername(trimmed)) {
      toast.error("Username must be 3–50 characters: letters, numbers, dashes, underscores");
      return;
    }
    if (!isValidEmail(email)) {
      toast.error("Invalid email address");
      return;
    }
    if (!isEdit && !isValidPassword(password)) {
      toast.error("Password must be 6–128 characters");
      return;
    }
    if (isEdit && setPasswordOnEdit && !isSelf && !isValidPassword(password)) {
      toast.error("Password must be 6–128 characters");
      return;
    }
    setBusy(true);
    try {
      if (!isEdit) {
        const created = await stargateJson<{ user?: UserRow }>("/users", {
          method: "POST",
          body: JSON.stringify({
            username: trimmed,
            password,
            email: email.trim() || undefined,
            roles: roleIds,
          }),
        });
        const id = created.user?.id;
        if (id && !active) {
          await stargateJson(`/users/${encodeURIComponent(id)}`, {
            method: "PUT",
            body: JSON.stringify({ is_active: false }),
          });
        }
        toast.success("User created");
      } else if (user?.id) {
        const body: Record<string, unknown> = {
          username: trimmed,
          email: email.trim() || "",
          roles: roleIds,
          is_active: active,
        };
        if (setPasswordOnEdit && !isSelf && password) {
          body.password = password;
        }
        await stargateJson(`/users/${encodeURIComponent(user.id)}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
        toast.success("User updated");
      }
      onOpenChange(false);
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit user" : "Create user"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update account details and assigned roles."
              : "Add an account for the control plane."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>
              Username <span className="text-destructive">*</span>
            </Label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Email (optional)</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
            />
          </div>
          {!isEdit || (setPasswordOnEdit && !isSelf) ? (
            <div className="space-y-1.5">
              <Label>
                Password {!isEdit ? <span className="text-destructive">*</span> : null}
              </Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  className="pr-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  className="absolute top-1/2 right-1.5 -translate-y-1/2"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </Button>
              </div>
            </div>
          ) : null}
          {isEdit && !isSelf ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={setPasswordOnEdit}
                onCheckedChange={(value) => setSetPasswordOnEdit(value === true)}
              />
              Set new password
            </label>
          ) : null}
          {isEdit && isSelf ? (
            <p className="text-xs text-muted-foreground">
              Change your own password from Account settings.
            </p>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={active}
              onCheckedChange={(value) => setActive(value === true)}
            />
            Active
          </label>
          <div className="space-y-2">
            <Label>Roles</Label>
            {roles.length === 0 ? (
              <p className="text-sm text-muted-foreground">No roles available</p>
            ) : (
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border p-3">
                {roles.map((role) => (
                  <label key={role.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={roleIds.includes(role.id)}
                      onCheckedChange={(value) => toggleRole(role.id, value === true)}
                    />
                    <span>{role.name}</span>
                    {role.description ? (
                      <span className="text-muted-foreground">— {role.description}</span>
                    ) : null}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            <Save />
            {isEdit ? "Save" : "Create user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
