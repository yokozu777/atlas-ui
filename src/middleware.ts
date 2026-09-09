import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PREFIXES = [
  "/login",
  "/change-password",
  "/setup",
  "/api/setup",
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/auth/change-password",
  "/_next",
  "/favicon",
];

export function middleware(request: NextRequest) {
  const apiUrl = (process.env.HUB_API_URL || process.env.STARGATE_API_URL)?.trim();
  if (!apiUrl) {
    return NextResponse.next();
  }
  const { pathname } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }
  const token = request.cookies.get("atlas_access")?.value;
  if (!token) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.png$).*)"],
};
