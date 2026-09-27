import type { MeResponse } from "@/lib/stargate";

export function atlasIsAdmin(me: MeResponse | null | undefined): boolean {
  if (!me) {
    return false;
  }
  if (me.remote === false) {
    return true;
  }
  return Boolean(me.isAdmin || me.user?.isAdmin);
}

export function atlasCan(
  me: MeResponse | null | undefined,
  name: string,
): boolean {
  if (!name) {
    return true;
  }
  if (me?.remote === false) {
    return true;
  }
  if (atlasIsAdmin(me)) {
    return true;
  }
  const permissions = me?.permissions ?? me?.user?.permissions ?? [];
  return permissions.includes(name);
}
