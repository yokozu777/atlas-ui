"use client";

import { useEffect, useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { AccountAppearanceFields } from "@/components/settings/user-ui-section";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  changePasswordStargate,
  deleteAvatarStargate,
  fetchMe,
  logoutStargate,
  updateProfileStargate,
  uploadAvatarStargate,
} from "@/lib/stargate";

async function squarePng(file: File, size = 256): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not crop the image");
  }
  const min = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - min) / 2;
  const sy = (bitmap.height - min) / 2;
  ctx.drawImage(bitmap, sx, sy, min, min, 0, 0, size, size);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) {
    throw new Error("Could not encode the image");
  }
  return blob;
}

function initialsOf(username: string) {
  return username.slice(0, 2).toUpperCase() || "?";
}

function UserAvatar({
  src,
  username,
  className,
}: {
  src: string | null;
  username: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [src]);
  const showImage = Boolean(src) && !broken;
  return (
    <Avatar className={className}>
      {showImage ? (
        <AvatarImage src={src ?? ""} alt="" onError={() => setBroken(true)} />
      ) : (
        <AvatarFallback>{initialsOf(username)}</AvatarFallback>
      )}
    </Avatar>
  );
}

export function ClusterctlUser() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("local");
  const [email, setEmail] = useState("");
  const [hasAvatar, setHasAvatar] = useState(false);
  const [avatarBust, setAvatarBust] = useState(0);
  const [remote, setRemote] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState<"email" | "password" | "avatar" | null>(null);

  async function loadMe() {
    const me = await fetchMe();
    if (!me) {
      return;
    }
    setUsername(me.username || me.user?.username || "local");
    setEmail(me.email || me.user?.email || "");
    setHasAvatar(Boolean(me.hasAvatar || me.user?.hasAvatar));
    setRemote(Boolean(me.remote));
  }

  useEffect(() => {
    void loadMe().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (open) {
      void loadMe().catch(() => undefined);
      setCurrentPassword("");
      setNewPassword("");
    }
  }, [open]);

  const avatarSrc = hasAvatar ? `/api/auth/avatar?t=${avatarBust}` : null;

  async function onSaveEmail(event: React.FormEvent) {
    event.preventDefault();
    if (!remote) {
      return;
    }
    setBusy("email");
    try {
      const data = await updateProfileStargate(email);
      setEmail(data.email || "");
      toast.success("Email saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function onChangePassword(event: React.FormEvent) {
    event.preventDefault();
    if (!remote) {
      return;
    }
    setBusy("password");
    try {
      await changePasswordStargate(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      toast.success("Password updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function onPickAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !remote) {
      return;
    }
    setBusy("avatar");
    try {
      const blob = await squarePng(file);
      await uploadAvatarStargate(blob);
      setHasAvatar(true);
      setAvatarBust(Date.now());
      toast.success("Avatar saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function onRemoveAvatar() {
    if (!remote) {
      return;
    }
    setBusy("avatar");
    try {
      await deleteAvatarStargate();
      setHasAvatar(false);
      setAvatarBust(Date.now());
      toast.success("Avatar removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function onLogout() {
    await logoutStargate();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <div className="flex w-full items-center gap-1">
        <button
          type="button"
          aria-label="Account"
          className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-lg px-2 py-1.5 text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={() => setOpen(true)}
        >
          <UserAvatar src={avatarSrc} username={username} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{username}</p>
            {email ? (
              <p className="truncate text-xs text-muted-foreground">{email}</p>
            ) : null}
          </div>
        </button>
        <button
          type="button"
          aria-label="Log out"
          title="Log out"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-sidebar-border text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden"
          onClick={() => void onLogout()}
        >
          <LogOut className="size-3.5" />
        </button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Account</DialogTitle>
            <DialogDescription>
              Password, avatar, email, and appearance for this console.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <UserAvatar src={avatarSrc} username={username} className="size-14 text-sm" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate font-medium">{username}</p>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    className="hidden"
                    onChange={(event) => void onPickAvatar(event)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!remote || busy === "avatar"}
                    onClick={() => fileRef.current?.click()}
                  >
                    {busy === "avatar" ? "Saving…" : "Set avatar"}
                  </Button>
                  {hasAvatar ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={!remote || busy === "avatar"}
                      onClick={() => void onRemoveAvatar()}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
            {remote ? (
              <>
                <form className="space-y-2" onSubmit={(event) => void onSaveEmail(event)}>
                  <Label htmlFor="account-email">Email</Label>
                  <div className="flex gap-2">
                    <Input
                      id="account-email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="optional"
                      autoComplete="email"
                    />
                    <Button type="submit" disabled={busy === "email"}>
                      {busy === "email" ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </form>
                <form
                  className="space-y-2"
                  onSubmit={(event) => void onChangePassword(event)}
                >
                  <Label>Password</Label>
                  <Input
                    type="password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    placeholder="Current password"
                    autoComplete="current-password"
                    required
                  />
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="New password"
                    autoComplete="new-password"
                    required
                    minLength={6}
                  />
                  <Button type="submit" disabled={busy === "password"}>
                    {busy === "password" ? "Saving…" : "Update password"}
                  </Button>
                </form>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Email, avatar, and password are stored on the hub. This console
                is in local mode.
              </p>
            )}
            <AccountAppearanceFields />
            <Separator />
            <Button
              type="button"
              variant="ghost"
              className="w-full text-destructive hover:text-destructive"
              onClick={() => void onLogout()}
            >
              Sign out
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
