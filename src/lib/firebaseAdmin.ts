/** Firebase Admin SDK: server-only, lazily initialized across hot reloads. */
import "server-only";
import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export class FirebaseAdminConfigurationError extends Error {
  constructor() {
    super("Firebase Admin is not configured. Set FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64 to a valid base64-encoded service account JSON, or FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON to the raw JSON.");
    this.name = "FirebaseAdminConfigurationError";
  }
}

function getAdminApp(): App {
  const existing = getApps().find((app) => app.name === "[DEFAULT]");
  if (existing) return existing;
  const value = (process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64 || "").trim();
  try {
    if (!value) throw new FirebaseAdminConfigurationError();
    const json = value.startsWith("{") ? value : Buffer.from(value, "base64").toString("utf8");
    const account = JSON.parse(json);
    if (!account || typeof account.project_id !== "string" || !account.project_id ||
        typeof account.client_email !== "string" || !account.client_email ||
        typeof account.private_key !== "string" || !account.private_key) {
      throw new FirebaseAdminConfigurationError();
    }
    return initializeApp({ credential: cert(account) });
  } catch {
    // Do not include the credential or JSON parser output in logs/responses.
    throw new FirebaseAdminConfigurationError();
  }
}

export function getAdminAuth() { return getAuth(getAdminApp()); }
export function getAdminDb() { return getFirestore(getAdminApp()); }
