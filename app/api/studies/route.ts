import type { NextRequest } from "next/server";
import { getRole, route } from "@/lib/api";
import { StudyModel } from "@/lib/models";

/** GET /api/studies  (any role) */
export const GET = route(async (req: NextRequest) => {
  getRole(req);
  const studies = await StudyModel.find().sort({ name: 1 });
  return Response.json({ studies: studies.map((s) => s.toJSON()) });
});
