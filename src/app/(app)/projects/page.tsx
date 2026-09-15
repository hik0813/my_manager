"use client";

import { useCallback, useEffect, useState } from "react";
import { Bar, Empty, Pill, Section } from "@/components/ui";
import { dday } from "@/lib/dates";
import type { Goal, Project, Task } from "@/lib/types";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState<"project" | "goal">("project");

  const load = useCallback(async () => {
    try {
      const [p, g, t] = await Promise.all([fetch("/api/projects"), fetch("/api/goals"), fetch("/api/tasks")]);
      if (!p.ok) throw new Error("프로젝트를 불러오지 못했습니다.");
      setProjects(((await p.json()) as { projects: Project[] }).projects);
      if (g.ok) setGoals(((await g.json()) as { goals: Goal[] }).goals);
      if (t.ok) setTasks(((await t.json()) as { tasks: Task[] }).tasks);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const active = projects.filter((p) => p.status !== "done");
  const done = projects.filter((p) => p.status === "done");

  async function addItem() {
    const name = newName.trim();
    if (!name) return;
    try {
      const url = adding === "project" ? "/api/projects" : "/api/goals";
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, title: name }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "추가 실패");
      setNewName("");
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "추가하지 못했습니다.");
    }
  }

  async function patchProject(id: string, patch: Record<string, unknown>) {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => undefined);
    void load();
  }

  async function bumpGoal(g: Goal, delta: number) {
    const progress = Math.max(0, Math.min(100, g.progress + delta));
    setGoals((prev) => prev.map((x) => (x.id === g.id ? { ...x, progress } : x)));
    await fetch(`/api/goals/${g.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ progress }),
    }).catch(() => undefined);
  }

  async function toggleTask(t: Task) {
    setTasks((prev) => prev.filter((x) => x.id !== t.id));
    await fetch(`/api/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ done: true }),
    }).catch(() => undefined);
  }

  return (
    <div>
      <h1 className="text-lg font-semibold mb-4">프로젝트</h1>
      {error && <p className="text-sm text-danger mb-3">{error}</p>}

      {/* 여태 프로젝트도 목표도 화면에서 만들 수 없었다. API만 있고 버튼이 없었다. */}
      <div className="flex gap-2 mb-5">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void addItem()}
          placeholder={adding === "project" ? "새 프로젝트 이름" : "새 목표"}
          className="tap flex-1 min-w-0 rounded-[10px] bg-surface2 border border-line px-3 py-2.5 outline-none focus:border-accent"
        />
        <select
          value={adding}
          onChange={(e) => setAdding(e.target.value as "project" | "goal")}
          className="tap rounded-[10px] bg-surface2 border border-line px-2 py-2.5"
          aria-label="추가할 종류"
        >
          <option value="project">프로젝트</option>
          <option value="goal">목표</option>
        </select>
        <button onClick={() => void addItem()} className="tap press rounded-[10px] bg-accent text-bg font-semibold px-3">
          추가
        </button>
      </div>

      <Section title="진행 중">
        {active.length === 0 ? (
          <Empty>
            {projects.length === 0
              ? "등록된 프로젝트가 없다. 마이그레이션 SQL의 시드를 실행하면 6개가 들어간다."
              : "진행 중인 게 없다. 아래 완료 목록에서 하나를 되돌리거나 새로 하나 시작해라."}
          </Empty>
        ) : (
          <ul>
            {active.map((p) => {
              const stall = p.stall_days ?? p.stalled_days;
              return (
                <li key={p.id} className="border-b border-line py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 text-[15px] truncate">{p.name}</span>
                    <span className="text-[11px] text-dim tabular-nums">{p.progress}%</span>
                    {stall >= 5 ? <Pill tone="danger">{stall}일 정체</Pill> : <Pill>{stall}일 전</Pill>}
                  </div>

                  <div className="mt-1.5 mb-1.5">
                    <Bar value={p.progress} />
                  </div>

                  {editing === p.id ? (
                    <div className="flex gap-2">
                      <input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            void patchProject(p.id, { next_action: draft });
                            setEditing(null);
                          }
                        }}
                        placeholder="다음 할 일 하나"
                        className="tap flex-1 rounded bg-surface2 border border-line px-2 py-1.5 text-sm outline-none focus:border-accent"
                      />
                      <button
                        onClick={() => {
                          void patchProject(p.id, { next_action: draft });
                          setEditing(null);
                        }}
                        className="tap press text-sm text-accent px-2"
                      >
                        저장
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditing(p.id);
                          setDraft(p.next_action ?? "");
                        }}
                        className="tap press flex-1 text-left text-[13px] text-muted"
                      >
                        {p.next_action ?? "다음 할 일이 비어 있다. 눌러서 하나만 정해라."}
                      </button>
                      <button
                        onClick={() => void patchProject(p.id, { progress: Math.min(100, p.progress + 10) })}
                        className="tap press text-[13px] text-dim px-2"
                        aria-label="진행도 10% 올리기"
                      >
                        +10%
                      </button>
                      <button
                        onClick={() => void patchProject(p.id, { status: "done", progress: 100 })}
                        className="tap press text-[13px] text-ok px-2"
                      >
                        완료
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {done.length > 0 && (
        <Section title={`완료 ${done.length}`}>
          <ul>
            {done.map((p) => (
              <li key={p.id} className="flex items-center gap-2 border-b border-line py-2.5">
                <span className="flex-1 text-[15px] text-dim truncate line-through">{p.name}</span>
                <button
                  onClick={() => void patchProject(p.id, { status: "active" })}
                  className="tap press text-[13px] text-dim px-2"
                >
                  되돌리기
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="목표">
        {goals.length === 0 ? (
          <Empty>목표가 없다. 마감이 있는 것부터 하나 적어라 — 대회 제출, 시험, 출시 같은 것.</Empty>
        ) : (
          <ul>
            {goals.map((g) => (
              <li key={g.id} className="border-b border-line py-2.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="flex-1 text-[15px]">{g.title}</span>
                  {g.target_at && <Pill tone="accent">{dday(g.target_at)}</Pill>}
                  <button onClick={() => void bumpGoal(g, 10)} className="tap press text-[13px] text-dim px-1">
                    +10%
                  </button>
                </div>
                <Bar value={g.progress} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`남은 할일 ${tasks.length}`}>
        {tasks.length === 0 ? (
          <Empty>비어 있다. 좋은 신호이거나, 아직 안 적었거나.</Empty>
        ) : (
          <ul>
            {tasks.map((t) => (
              <li key={t.id} className="flex items-center gap-3 border-b border-line py-2.5">
                <button onClick={() => void toggleTask(t)} aria-label="완료" className="tap shrink-0 h-6 w-6 rounded border border-line" />
                <span className="flex-1 text-[15px]">{t.title}</span>
                {t.due_at && <span className="text-[11px] text-dim">{dday(t.due_at)}</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
