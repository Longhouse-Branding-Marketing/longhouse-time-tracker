import type { ReactNode } from "react";
import { initials } from "@/lib/formatters";
import type { Tone } from "@/lib/formatters";

const TONE_BADGE: Record<Tone, string> = {
  positive: "bg-positive-soft text-[color:var(--color-positive)]",
  neutral: "bg-tint text-muted",
  review: "bg-review-soft text-[color:var(--color-review)]",
  serious: "bg-serious-soft text-[color:var(--color-serious)]",
  info: "bg-info-soft text-brand-600",
};

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${TONE_BADGE[tone]}`}
    >
      {children}
    </span>
  );
}

/** Bordered card section — consistent header + body inset. */
export function Panel({
  title,
  right,
  children,
  className = "",
  bodyClassName = "",
  noBodyPadding = false,
  footer,
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  noBodyPadding?: boolean;
  /** Renders below the card (e.g. a hanging drawer tab). */
  footer?: ReactNode;
}) {
  const card = (
    <section
      className={`overflow-hidden rounded-xl border border-line bg-card shadow-[0_1px_2px_rgba(2,22,61,0.04)] ${className}`}
    >
      {title ? (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="lh-section-title">{title}</h2>
          {right}
        </div>
      ) : null}
      {noBodyPadding ? (
        children
      ) : (
        <div className={`px-5 py-5 ${bodyClassName}`}>{children}</div>
      )}
    </section>
  );

  if (!footer) return card;

  return (
    <div className="relative">
      <div className="relative z-10">{card}</div>
      {footer}
    </div>
  );
}

export function SectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="lh-section-title">{children}</h2>;
}

export function EmptyRow({ children }: { children: ReactNode }) {
  return (
    <div className="px-5 py-10 text-center text-[13px] text-muted">{children}</div>
  );
}

/** Page shell — centered content on the surface canvas. */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1180px] px-6 py-8 sm:px-8">{children}</div>
  );
}

export function PageHeader({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-9 flex-wrap items-center justify-between gap-3">
      <h1 className="lh-page-title">{title}</h1>
      {children ? <div className="flex items-center gap-2">{children}</div> : null}
    </div>
  );
}

/** Compact KPI tile — always fits its content. */
export function StatCard({
  label,
  value,
  sub,
  className = "",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-line bg-card px-4 py-3.5 shadow-[0_1px_2px_rgba(2,22,61,0.04)] ${className}`}
    >
      <div className="lh-section-title">{label}</div>
      <div className="mt-1.5 font-sans text-[28px] font-normal leading-none tracking-normal tabular-nums text-accent-deep">
        {value}
      </div>
      {sub ? <div className="mt-1.5 text-[12px] tracking-normal text-muted">{sub}</div> : null}
    </div>
  );
}

const AVATAR_SIZES = {
  sm: "h-7 w-7 text-[11px]",
  md: "h-9 w-9 text-xs",
  lg: "h-14 w-14 text-base",
} as const;

export function Avatar({
  name,
  photoUrl,
  size = "md",
}: {
  name: string;
  photoUrl?: string | null;
  size?: keyof typeof AVATAR_SIZES;
}) {
  const cls = AVATAR_SIZES[size];
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name}
        className={`${cls} shrink-0 rounded-full object-cover ring-1 ring-line`}
      />
    );
  }
  return (
    <span
      className={`${cls} flex shrink-0 items-center justify-center rounded-full bg-blue-1 font-semibold text-brand ring-1 ring-line`}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
