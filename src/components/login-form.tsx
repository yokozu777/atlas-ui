"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginStargate } from "@/lib/stargate";
import { safeAtlasNextPath } from "@/lib/hub-session-gate";

export function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showDefaultCredentials, setShowDefaultCredentials] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/auth/bootstrap", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { showDefaultCredentials?: boolean } | null) => {
        if (!cancelled && data?.showDefaultCredentials) {
          setShowDefaultCredentials(true);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await loginStargate(username, password);
      toast.success("Signed in");
      const mustChange =
        data.user &&
        typeof data.user === "object" &&
        "must_change_password" in data.user &&
        Boolean((data.user as { must_change_password?: boolean }).must_change_password);
      router.push(
        mustChange ? "/change-password" : safeAtlasNextPath(search.get("next")),
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md py-16">
      <PageHeader
        kicker="atlas-ui"
        title="Sign in"
        description="Sign in to this atlas-ui console. Your session stays on this host."
      />
      {showDefaultCredentials ? (
        <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          <p className="font-medium text-warning">Default credentials</p>
          <p className="text-muted-foreground">
            Username <code className="font-mono text-xs">admin</code>, password{" "}
            <code className="font-mono text-xs">admin</code>. Change this password
            after sign-in.
          </p>
        </div>
      ) : null}
      <Panel>
        <form className="space-y-4 p-6" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                className="pr-9"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
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
          <Button type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Panel>
    </div>
  );
}
