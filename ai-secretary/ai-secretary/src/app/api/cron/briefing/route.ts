import { fail, handle } from "@/lib/api";
import { verifyCronRequest } from "@/lib/auth";
import { generateMorningBriefing } from "@/lib/briefing";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!verifyCronRequest(req)) return fail("cron 인증 실패", 401);
  return handle(async () => generateMorningBriefing());
}

export const POST = GET;
