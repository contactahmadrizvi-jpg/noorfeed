/**
 * POST /api/auth/logout
 *
 * Clears the __session cookie and revokes the underlying Firebase
 * refresh tokens so the session can never be reused.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/src/lib/firebaseAdmin";

export async function POST(req: NextRequest) {
  const sessionCookie = req.cookies.get("__session")?.value;

  const response = NextResponse.json({ status: "ok" });

  // Always clear the cookie — even if verification fails
  response.cookies.set("__session", "", {
    maxAge:   0,
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    path:     "/",
  });

  if (sessionCookie) {
    try {
      const decoded = await getAdminAuth().verifySessionCookie(sessionCookie);
      // Revoke all refresh tokens for this user
      await getAdminAuth().revokeRefreshTokens(decoded.uid);
    } catch {
      // Cookie was already invalid — that's fine, we cleared it above
    }
  }

  return response;
}
