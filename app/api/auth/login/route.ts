/**
 * POST /api/auth/login
 *
 * Body: { idToken: string }
 *
 * Exchanges a Firebase ID token (from the client) for a long-lived session
 * cookie stored in an HttpOnly, Secure, SameSite=Lax cookie.
 *
 * Flow:
 *  1. Client calls Firebase signInWithEmailAndPassword / signInWithPopup.
 *  2. Client gets idToken from user.getIdToken().
 *  3. Client POSTs idToken to this route.
 *  4. This route calls Firebase Admin createSessionCookie and sets the cookie.
 *
 * The cookie is then verified by middleware.ts on every request — no
 * client-side auth flashing, no onAuthStateChanged waterfall.
 */
import { NextRequest, NextResponse } from "next/server";
import { FirebaseAdminConfigurationError, getAdminAuth } from "@/src/lib/firebaseAdmin";

const MAX_AGE = parseInt(process.env.SESSION_COOKIE_MAX_AGE ?? "1209600", 10); // 14 days
const IS_PROD = process.env.NODE_ENV === "production";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const idToken = body?.idToken as string | undefined;

    if (!idToken || typeof idToken !== "string") {
      return NextResponse.json(
        { error: "idToken is required" },
        { status: 400 }
      );
    }

    // Verify the ID token is valid before minting a session cookie
    await getAdminAuth().verifyIdToken(idToken);

    // Create a session cookie that lasts MAX_AGE seconds
    const sessionCookie = await getAdminAuth().createSessionCookie(idToken, {
      expiresIn: MAX_AGE * 1000, // Firebase Admin expects milliseconds
    });

    const response = NextResponse.json({ status: "ok" });

    response.cookies.set("__session", sessionCookie, {
      maxAge:   MAX_AGE,
      httpOnly: true,
      secure:   IS_PROD,
      sameSite: "lax",
      path:     "/",
    });

    return response;
  } catch (err: unknown) {
    if (err instanceof FirebaseAdminConfigurationError) {
      return NextResponse.json({ error: "Server sessions are unavailable until Firebase Admin credentials are configured." }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Authentication failed";
    console.error("[api/auth/login]", message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
