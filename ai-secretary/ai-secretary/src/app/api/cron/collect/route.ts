import { fail, handle } from "@/lib/api";
import { verifyCronRequest } from "@/lib/auth";
import { runCollection } from "@/lib/collectors/run";
import { ensureReviews } from "@/lib/reviews";
import { runWatchdog } from "@/lib/watchdog";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!verifyCronRequest(req)) return fail("cron 인증 실패", 401);
  const slot = new URL(req.url).searchParams.get("slot") ?? "morning";

  return handle(async () => {
    const report = await runCollection(slot);
    const reviews = await ensureReviews().catch(() => 0);
    const watchdog = await runWatchdog().catch((e) => ({ checked: [], raised: 0, error: String(e) }));
    return { report, reviews_created: reviews, watchdog };
  });
}

export const POST = GET;
