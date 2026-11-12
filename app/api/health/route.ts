import mongoose from "mongoose";
import { connection } from "next/server";
import { connectDB } from "@/lib/db";

// GET /api/health — confirms the app can reach MongoDB.
export async function GET() {
  // Cache Components is on: opt out of prerendering so the DB is hit per request.
  await connection();

  try {
    await connectDB();
    await mongoose.connection.db!.admin().ping();
    return Response.json({
      status: "ok",
      db: mongoose.connection.name,
    });
  } catch (err) {
    console.error("[health] MongoDB check failed:", err);
    return Response.json(
      { status: "error", message: "Database unreachable" },
      { status: 503 },
    );
  }
}
