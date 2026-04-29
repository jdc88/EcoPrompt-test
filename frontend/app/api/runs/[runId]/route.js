import { NextResponse } from "next/server";
import { getRun } from "@/lib/server/runStore";

export const runtime = "nodejs";

export async function GET(_request, { params }) {
  const runId = Number(params?.runId);
  if (!Number.isFinite(runId) || runId <= 0) {
    return NextResponse.json({ error: "invalid run id" }, { status: 400 });
  }
  const run = getRun(runId);
  if (!run) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }
  return NextResponse.json(run);
}
