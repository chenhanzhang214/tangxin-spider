import { UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { type NamedCount } from "@/lib/tx/types";

export function SectionTitle({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div>
      <p className="text-xs font-medium tracking-widest text-accent">{kicker}</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-fg">{title}</h2>
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-dashed border-line px-4 py-8 text-sm text-muted">
      {message}
    </p>
  );
}

export function MetricCard({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  note: string;
}) {
  return (
    <article className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3 text-xs text-muted">
        <span>{label}</span>
        <Icon className="size-4 text-accent" strokeWidth={1.7} />
      </div>
      <p className="mt-4 font-display text-3xl text-fg tabular-nums">{value}</p>
      <p className="mt-1 font-mono text-[10px] text-faint">{note}</p>
    </article>
  );
}

export function CloudBlock({
  icon: Icon,
  title,
  items,
}: {
  icon: typeof UserRound;
  title: string;
  items: NamedCount[];
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-center gap-2 text-sm text-muted">
        <Icon className="size-4" strokeWidth={1.75} />
        {title}
      </div>
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.slug} className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-fg">{item.name}</span>
            <span className="font-mono text-xs tabular-nums text-faint">{item.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
