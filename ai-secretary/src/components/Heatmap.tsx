"use client";

import { addDays } from "@/lib/dates";

type Log = { date: string; one_liner: string; mood: number | null };

/** 달력형 히트맵 — 최근 26주. 기록이 있으면 강조색, 기분이 높을수록 진하게. */
export default function Heatmap({ logs, today, onPick }: { logs: Log[]; today: string; onPick?: (date: string) => void }) {
  const byDate = new Map(logs.map((l) => [l.date, l]));
  const weeks = 26;
  const start = addDays(today, -(weeks * 7 - 1));

  const cells: { date: string; log?: Log }[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const date = addDays(start, i);
    cells.push({ date, log: byDate.get(date) });
  }

  const columns: { date: string; log?: Log }[][] = [];
  for (let w = 0; w < weeks; w++) columns.push(cells.slice(w * 7, w * 7 + 7));

  return (
    <div className="scroll-x pb-1">
      <div className="flex gap-[3px]">
        {columns.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-[3px]">
            {col.map((c) => {
              const level = c.log ? Math.max(1, Math.min(4, c.log.mood ?? 3)) : 0;
              const bg =
                level === 0
                  ? "var(--color-line)"
                  : `color-mix(in oklab, var(--color-accent) ${level * 22 + 12}%, var(--color-surface))`;
              return (
                <button
                  key={c.date}
                  title={c.log ? `${c.date} — ${c.log.one_liner}` : c.date}
                  onClick={() => onPick?.(c.date)}
                  className="h-3 w-3 rounded-[2px]"
                  style={{ background: bg }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
