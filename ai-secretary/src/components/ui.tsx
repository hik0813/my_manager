import type { ReactNode } from "react";

export function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mb-6">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-[13px] font-semibold text-muted">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

/** 빈 화면은 분위기 문구가 아니라 다음 행동을 안내하는 자리다. */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-dim leading-relaxed py-3">{children}</p>;
}

export function Row({
  children,
  onClick,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const base = `w-full text-left border-b border-line py-3 ${className}`;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${base} press tap`}>
        {children}
      </button>
    );
  }
  return <div className={base}>{children}</div>;
}

export function Pill({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "accent" | "danger" | "ok" }) {
  const tones = {
    muted: "text-dim border-line",
    accent: "text-accent border-accent/40",
    danger: "text-danger border-danger/40",
    ok: "text-ok border-ok/40",
  } as const;
  return (
    <span className={`inline-block text-[11px] leading-4 px-1.5 py-0.5 rounded border ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Bar({ value }: { value: number }) {
  return (
    <div className="h-1 w-full bg-line rounded overflow-hidden">
      <div className="h-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <p className="text-sm text-danger py-2">{children}</p>;
}
