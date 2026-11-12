import "server-only";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { nextCookies } from "better-auth/next-js";
import { env, googleEnabled } from "@/lib/env";
import { db, mongoClient } from "@/lib/db/mongo";

function createAuth() {
  const e = env();
  return betterAuth({
    appName: "Orbit",
    secret: e.BETTER_AUTH_SECRET,
    baseURL: e.BETTER_AUTH_URL,
    database: mongodbAdapter(db(), { client: mongoClient() }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      autoSignIn: true,
    },
    socialProviders: googleEnabled()
      ? { google: { clientId: e.GOOGLE_CLIENT_ID!, clientSecret: e.GOOGLE_CLIENT_SECRET! } }
      : {},
    session: {
      // Long-lived sessions: this is a personal app that must keep working offline.
      expiresIn: 60 * 60 * 24 * 60, // 60 days
      updateAge: 60 * 60 * 24, // refresh daily
    },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
let instance: Auth | undefined;

/** Lazily created so builds don't need database credentials. */
export function auth(): Auth {
  instance ??= createAuth();
  return instance;
}

/** Returns the signed-in user's id for a request, or null. Use in every Route Handler. */
export async function getUserId(headers: Headers): Promise<string | null> {
  const session = await auth().api.getSession({ headers });
  return session?.user.id ?? null;
}
