"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { fetchSetup } from "@/lib/api";
import { fetchMe, logoutStargate } from "@/lib/stargate";

export function ClusterctlUser() {
  const router = useRouter();
  const [root, setRoot] = useState<string>("clusterctl");
  const [username, setUsername] = useState<string>("local");

  useEffect(() => {
    void fetchSetup()
      .then((data) => {
        if (data.clusterctlRoot) {
          setRoot(data.clusterctlRoot);
        }
      })
      .catch(() => undefined);
    void fetchMe()
      .then((me) => {
        if (me?.username) {
          setUsername(me.username);
        }
      })
      .catch(() => undefined);
  }, []);

  const short = root.split("/").filter(Boolean).slice(-2).join("/") || root;

  async function onLogout() {
    await logoutStargate();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2 overflow-hidden rounded-lg px-2 py-1.5">
      <Avatar>
        <AvatarFallback>{username.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-medium">{username}</p>
        <p className="truncate font-mono text-xs text-muted-foreground" title={root}>
          {short}
        </p>
      </div>
      <Button type="button" size="xs" variant="ghost" onClick={() => void onLogout()}>
        Out
      </Button>
    </div>
  );
}
