import QuickCapture from "@/components/QuickCapture";
import ServiceWorker from "@/components/ServiceWorker";
import TabBar from "@/components/TabBar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <main className="px-4 safe-top pb-28 pt-3 mx-auto w-full max-w-2xl">{children}</main>
      <QuickCapture />
      <TabBar />
      <ServiceWorker />
    </div>
  );
}
