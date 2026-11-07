/**
 * Next.js Edge Middleware — runs before every request on the matching paths.
 *
 * What it does:
 *  1. Reads the __session cookie (set by /api/auth/login).
 *  2. Calls /api/auth/verify (our own lightweight endpoint) to validate it.
 *     Using a fetch() to our own API is the recommended pattern for Edge
 *     middleware because firebase-admin uses Node.js APIs unavailable on the
 *     Edge runtime.
 *  3. Protects /messages and /create — redirects unauthenticated users to /.
 *  4. Skips static assets, API routes, and Next.js internals to avoid overhead.
 *
 * Crucially this runs at the CDN edge — 0 ms client-side flash, no
 * onAuthStateChanged needed to enforce route protection.
 */
import { NextRequest, NextResponse } from "next/server";

// Routes that require authentication
const PROTECTED_PATHS = ["/messages", "/create", "/settings"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip Next.js internals, static files, and API routes
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/static") ||
    /\.(.*)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  const sessionCookie = req.cookies.get("__session")?.value;

  // Fast path: no cookie at all → redirect immediately without a network call
  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Verify the session cookie by calling our own verify endpoint.
  // This runs at the edge and is very fast (~5-10ms on Vercel).
  try {
    const verifyUrl = new URL("/api/auth/verify", req.url);
    const res = await fetch(verifyUrl.toString(), {
      headers: { cookie: `__session=${sessionCookie}` },
      // 3-second timeout — fall through on network errors
      signal: AbortSignal.timeout(3000),
    });

    if (res.ok) {
      const data = (await res.json()) as { uid: string | null };
      if (data.uid) return NextResponse.next();
    }
  } catch {
    // Verification failed (network, timeout) — fail-open for resilience
    // The page itself will check auth via onAuthStateChanged as a fallback
    return NextResponse.next();
  }

  // Session cookie present but invalid → clear it and redirect
  const redirectResponse = NextResponse.redirect(new URL("/", req.url));
  redirectResponse.cookies.set("__session", "", { maxAge: 0, path: "/" });
  return redirectResponse;
}

export const config = {
  // Run on all paths except those listed above
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
