import type { NextRequest } from "next/server";
import { ApiError, assertObjectId, getRole, parseBody, route, toApi } from "@/lib/api";
import { StudyMatchModel } from "@/lib/models";
import { applyMatchOp, matchOpSchema } from "@/lib/operations";
import type { StudyMatch } from "@/lib/types";

/**
 * PATCH /api/matches/:id
 * - doctor:    { type: "review", decision: "confirmed" | "rejected" }
 * - reception: { type: "record_contact", contactStatus: "reached" | "not_reached", consent }
 * Contact and consent are separate: a match or a call never sets consent on its own.
 */
export const PATCH = route(async (req: NextRequest, ctx: RouteContext<"/api/matches/[id]">) => {
  const role = getRole(req);
  const { id } = await ctx.params;
  assertObjectId(id);
  const op = await parseBody(req, matchOpSchema);

  const doc = await StudyMatchModel.findById(id);
  if (!doc) throw new ApiError(404, "Match not found.");
  const current = toApi<StudyMatch>(doc);
  const { status, reviewedBy, contactStatus, consent } = applyMatchOp(role, current, op);

  // Only write if the match hasn't changed status since we read it.
  const updated = await StudyMatchModel.findOneAndUpdate(
    { _id: id, status: current.status },
    { $set: { status, reviewedBy, contactStatus, consent } },
    { new: true, runValidators: true },
  );
  if (!updated) throw new ApiError(409, "This match was just updated by someone else. Reload and try again.");
  return Response.json({ match: toApi<StudyMatch>(updated) });
});
