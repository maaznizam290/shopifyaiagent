import { Sidebar } from "@/components/Sidebar";
import { getActiveStore } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const store = await getActiveStore();
  return (
    <div className="min-h-screen lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <Sidebar storeName={store?.name ?? "No store"} mode={store?.mode ?? "DEMO"} />
      <main id="main" className="min-w-0 flex-1">
        <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</div>
        <footer className="mx-auto max-w-[1400px] px-4 pb-8 text-xs text-steel sm:px-6 lg:px-10">
          PromiSure AI · Every campaign, verified against live store facts. · A NousGen product. PromiSure AI never changes prices, inventory, ads or customer communications.
        </footer>
      </main>
    </div>
  );
}
