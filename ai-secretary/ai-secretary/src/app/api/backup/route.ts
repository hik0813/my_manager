import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { kstDate } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const TABLES = [
  "projects",
  "tasks",
  "goals",
  "daily_logs",
  "meals",
  "error_logs",
  "notes",
  "sources",
  "items",
  "snapshots",
  "alerts",
  "watchlist",
  "reviews",
  "briefings",
  "timeline_events",
  "views",
  "captures",
];

/** 탭 한 번으로 전체 테이블을 파일로 받는다. 이 파일 하나로 복원 가능해야 한다. */
export async function GET() {
  const sb = db();
  const dump: Record<string, unknown> = {
    _meta: { exported_at: new Date().toISOString(), date: kstDate(), version: 1, tables: TABLES },
  };

  for (const table of TABLES) {
    const rows: unknown[] = [];
    let offset = 0;
    // 페이지네이션 — supabase 기본 상한을 넘겨도 전부 담는다
    for (;;) {
      const res = await sb.from(table).select("*").range(offset, offset + 999);
      if (res.error) {
        dump[table] = { error: res.error.message };
        break;
      }
      rows.push(...(res.data ?? []));
      if (!res.data || res.data.length < 1000) {
        dump[table] = rows;
        break;
      }
      offset += 1000;
    }
  }

  return new NextResponse(JSON.stringify(dump, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="assistant-backup-${kstDate()}.json"`,
    },
  });
}
