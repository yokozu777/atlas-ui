"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import {
  FAVORITES_EVENT,
  parseFavoriteIds,
  toggleFavoriteId,
} from "@/lib/favorites";

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(FAVORITES_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(FAVORITES_EVENT, onStoreChange);
  };
}

function getServerSnapshot() {
  return "[]";
}

export function useFavoriteIds(storageKey: string) {
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return window.localStorage.getItem(storageKey) || "[]";
      } catch {
        return "[]";
      }
    },
    getServerSnapshot,
  );
  const ids = useMemo(() => parseFavoriteIds(raw), [raw]);
  const starred = useMemo(() => new Set(ids), [ids]);

  const toggle = useCallback(
    (id: string) => {
      const next = toggleFavoriteId(ids, id);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* quota / private mode */
      }
      window.dispatchEvent(new Event(FAVORITES_EVENT));
      return next.includes(id.trim());
    },
    [ids, storageKey],
  );

  const isFavorite = useCallback((id: string) => starred.has(id), [starred]);

  return { ids, starred, isFavorite, toggle };
}
