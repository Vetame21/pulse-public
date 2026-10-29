// Shown instantly while a page's data loads, so a tap always responds at once.
// Kept neutral (title + content block) so it doesn't look like a different page.
export default function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-40 animate-pulse rounded-lg bg-track" />
      <div className="h-48 animate-pulse rounded-2xl border border-line bg-surface" />
      <div className="flex flex-col gap-2">
        <div className="h-4 w-3/4 animate-pulse rounded bg-track" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-track" />
      </div>
    </div>
  );
}
