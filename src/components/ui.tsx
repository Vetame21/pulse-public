import Link from "next/link";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-surface p-5 shadow-card ${className}`}>{children}</section>;
}

export function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wider text-muted">{children}</p>;
}

export function PageHeader({
  title,
  eyebrow,
  action,
}: {
  title: string;
  eyebrow?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="text-sm font-medium text-accent">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      </div>
      {action}
    </header>
  );
}

export function ProgressBar({ value, tone = "accent" }: { value: number; tone?: "accent" | "warning" | "danger" }) {
  const color = tone === "danger" ? "bg-danger" : tone === "warning" ? "bg-warning" : "bg-accent";
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-track" role="presentation">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="-ml-1 inline-flex min-h-11 items-center self-start px-1 text-sm font-medium text-muted">
      ← {label}
    </Link>
  );
}
