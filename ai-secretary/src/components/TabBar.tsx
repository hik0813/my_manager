"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/today", label: "오늘" },
  { href: "/projects", label: "프로젝트" },
  { href: "/interests", label: "관심사" },
  { href: "/records", label: "기록" },
  { href: "/more", label: "더보기" },
];

export default function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-bg/95 backdrop-blur border-t border-line safe-bottom">
      <ul className="flex">
        {TABS.map((t) => {
          const active = pathname === t.href || pathname.startsWith(t.href + "/");
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                className={`tap flex items-center justify-center py-3 text-[13px] ${
                  active ? "text-accent font-semibold" : "text-muted"
                }`}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
