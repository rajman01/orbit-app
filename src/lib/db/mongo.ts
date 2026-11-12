import "server-only";
import { MongoClient, type Db } from "mongodb";
import { env } from "@/lib/env";

declare global {
  // Reuse the client across hot reloads in development.
  var __orbitMongo: MongoClient | undefined;
}

/** Shared MongoDB client. Connects lazily on first operation. */
export function mongoClient(): MongoClient {
  if (!globalThis.__orbitMongo) {
    globalThis.__orbitMongo = new MongoClient(env().MONGODB_URI, { appName: "orbit" });
  }
  return globalThis.__orbitMongo;
}

/** The app database (name taken from the connection string, default "orbit"). */
export function db(): Db {
  return mongoClient().db();
}

/** Test hook: point the shared client at a different server (e.g. mongodb-memory-server). */
export function __setMongoClientForTests(client: MongoClient) {
  globalThis.__orbitMongo = client;
}
