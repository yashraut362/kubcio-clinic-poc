import mongoose from "mongoose";

/**
 * Cached Mongoose connection.
 *
 * In dev, Next.js hot-reloads modules, and in serverless deployments each warm
 * instance re-imports this file. Caching the connection promise on `globalThis`
 * means we open one connection pool per process instead of one per reload/request.
 */
type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalForMongoose = globalThis as typeof globalThis & {
  mongooseCache?: MongooseCache;
};

const cache: MongooseCache = (globalForMongoose.mongooseCache ??= {
  conn: null,
  promise: null,
});

export async function connectDB(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. Add it to .env.local (see .env.example).",
    );
  }

  cache.promise ??= mongoose.connect(uri, {
    // Fail queries immediately when disconnected instead of silently queueing them.
    bufferCommands: false,
    // Assumption: small POC, likely deployed serverless (e.g. Vercel), where every
    // instance gets its own pool. Keep it small so many instances don't exhaust
    // the cluster's connection limit. Raise it if you run a long-lived server
    // with high concurrency.
    maxPoolSize: 10,
    // Release idle connections fairly quickly; serverless instances sit idle often.
    maxIdleTimeMS: 30_000,
    // Surface a clear error within 5s if the cluster is unreachable
    // (wrong URI, IP not allow-listed) rather than hanging for the 30s default.
    serverSelectionTimeoutMS: 5_000,
  });

  try {
    cache.conn = await cache.promise;
  } catch (err) {
    // Reset so the next call retries instead of reusing a rejected promise.
    cache.promise = null;
    throw err;
  }

  return cache.conn;
}
