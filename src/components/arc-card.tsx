import Link from "next/link";
import { ARCS, FLAVOURS, SPECTRUM, spectrumPosition } from "@/lib/arc";
import type { ArcState } from "@/lib/data/arc";

export function ArcSpectrum({ pace, arc }: { pace: number | null; arc: string }) {
  return (
    <div>
      <div className="relative">
        <div className="grid grid-cols-5 gap-[2px] overflow-hidden rounded-full">
          {SPECTRUM.map((k) => (
            <div key={k} className={`h-2.5 ${k === arc ? "bg-chart" : "bg-track"}`} />
          ))}
        </div>
        {arc !== "fresh" && (
          <div
            className="absolute -top-1 h-[18px] w-[18px] -translate-x-1/2 rounded-full border-2 border-surface bg-foreground"
            style={{ left: `${spectrumPosition(pace)}%` }}
            aria-hidden
          />
        )}
      </div>
      <div className="mt-1.5 grid grid-cols-5 text-center text-[11px] text-muted">
        {SPECTRUM.map((k) => (
          <span key={k} className={k === arc ? "font-semibold text-foreground" : ""}>
            {ARCS[k].emoji}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ArcCard({ state }: { state: ArcState }) {
  const a = ARCS[state.arc];
  const flavour = state.flavour ? FLAVOURS[state.flavour] : null;
  return (
    <Link href="/arc" className="block rounded-2xl border border-line bg-surface p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Your arc this month</p>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight">
            <span aria-hidden>{a.emoji}</span> {flavour && state.arc !== "fresh" ? `${flavour.name} ` : ""}
            {a.name}
          </p>
          <p className="mt-1 text-sm text-muted">{a.line}</p>
        </div>
        <span className="text-muted" aria-hidden>
          ›
        </span>
      </div>
      <div className="mt-4">
        <ArcSpectrum pace={state.pace} arc={state.arc} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-track px-2.5 py-1">🔥 {state.streak}-day streak</span>
        {state.noSpendThisMonth > 0 && <span className="rounded-full bg-track px-2.5 py-1">🚫💸 {state.noSpendThisMonth} no-spend day{state.noSpendThisMonth === 1 ? "" : "s"}</span>}
        {state.comeback && <span className="rounded-full bg-accent-soft px-2.5 py-1">📈 Comeback</span>}
        {flavour && <span className="rounded-full bg-track px-2.5 py-1">{flavour.emoji} {flavour.name}</span>}
      </div>
    </Link>
  );
}
