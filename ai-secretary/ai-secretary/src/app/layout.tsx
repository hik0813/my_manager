import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "개인 비서",
  description: "나를 아는 비서 — 오늘 필요한 것만 먼저 꺼내준다",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "비서",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-180.png",
  },
  formatDetection: { telephone: false, date: false, address: false, email: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0e14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
