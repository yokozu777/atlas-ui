"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { atlasCan, atlasIsAdmin } from "@/lib/authz-can";
import { fetchMe, type MeResponse } from "@/lib/stargate";

type Authz = {
  ready: boolean;
  me: MeResponse | null;
  isAdmin: boolean;
  permissions: string[];
  can: (name: string) => boolean;
};

const AuthzContext = createContext<Authz | null>(null);

export function AuthzProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchMe()
      .then((row) => {
        if (!cancelled) setMe(row);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isAdmin = atlasIsAdmin(me);
  const permissions = me?.permissions ?? me?.user?.permissions ?? [];
  const can = useCallback((name: string) => atlasCan(me, name), [me]);

  const value = useMemo(
    () => ({ ready, me, isAdmin, permissions, can }),
    [ready, me, isAdmin, permissions, can],
  );
  return <AuthzContext.Provider value={value}>{children}</AuthzContext.Provider>;
}

export function useAuthz(): Authz {
  const ctx = useContext(AuthzContext);
  if (!ctx) {
    return {
      ready: false,
      me: null,
      isAdmin: false,
      permissions: [],
      can: () => false,
    };
  }
  return ctx;
}

export function useCan() {
  return useAuthz().can;
}
