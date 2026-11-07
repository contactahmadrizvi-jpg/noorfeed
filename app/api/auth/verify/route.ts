/**
 * GET /api/auth/verify
 *
 * Verifies the __session cookie and returns the decoded claims.
 * Used by client components that need the server-verified UID
 * without waiting for onAuthStateChanged.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/src/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  const sessionCookie = req.cookies.get("__session")?.value;

  if (!sessionCookie) {
    return NextResponse.json({ uid: null }, { status: 200 });
  }

  try {
    const decoded = await getAdminAuth().verifySessionCookie(sessionCookie, true);
    return NextResponse.json({
      uid:   decoded.uid,
      email: decoded.email ?? null,
    });
  } catch {
    return NextResponse.json({ uid: null }, { status: 200 });
  }
}
