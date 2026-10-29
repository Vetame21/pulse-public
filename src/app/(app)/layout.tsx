import { BottomNav } from "@/components/bottom-nav";
import { isDemoMode } from "@/lib/demo";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      {isDemoMode() && (
        <p className="bg-accent-soft px-4 py-2 text-center text-xs">
          Demo with made-up data. Your changes are only kept for a while.
        </p>
      )}
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 pt-6 pb-28">{children}</main>
      <BottomNav />
    </>
  );
}
