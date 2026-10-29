// Calendar-shaped placeholder: month header and a 7-column grid.
export default function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading calendar">
      <div className="h-7 w-36 animate-pulse rounded-lg bg-track" />
      <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
        <div className="mx-auto h-5 w-32 animate-pulse rounded bg-track" />
        <div className="mt-5 grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }, (_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-lg bg-track/60" />
          ))}
        </div>
      </div>
    </div>
  );
}
