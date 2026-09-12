import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionCookieValue } from "@/lib/auth";

/** 로그인·크론·정적 파일을 제외한 전 경로를 차단한다. */
const PUBLIC_PREFIXES = ["/login", "/api/auth/login", "/api/cron", "/manifest.json", "/icons", "/sw.js"];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const ok = await verifySessionCookieValue(req.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
