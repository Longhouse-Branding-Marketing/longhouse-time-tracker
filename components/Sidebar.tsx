"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowsClockwiseIcon,
  ClockIcon,
  GearSixIcon,
  LightbulbIcon,
  SignOutIcon,
  UploadSimpleIcon,
  UsersThreeIcon,
  WrenchIcon,
} from "@phosphor-icons/react";
import { refreshTimeTrackingData } from "@/app/actions";
import { invalidateApiCache } from "@/lib/api";
import { useHubAccessToken } from "@/lib/hub/HubSessionContext";
import { AskAiButton } from "@/components/chat/AskAiButton";
import { Avatar } from "@/components/ui";

const NAV = [
  { href: "/", label: "Time Dashboard", Icon: ClockIcon },
  { href: "/people", label: "People", Icon: UsersThreeIcon },
  { href: "/settings", label: "Settings", Icon: GearSixIcon },
] as const;

const MENU_ICON = 16;

const USER_MENU_LINKS = [
  { label: "Import", href: "/import", Icon: UploadSimpleIcon },
  {
    label: "Request a Feature",
    href: "https://www.longhouse.co/contact/",
    external: true,
    Icon: LightbulbIcon,
  },
  {
    label: "Longhouse Tools",
    href: "https://www.longhouse.co/",
    external: true,
    Icon: WrenchIcon,
  },
  { label: "Sign Out", href: "#sign-out", Icon: SignOutIcon },
] as const;

const DOCK_ICON = 20;

function DockTooltip({ label }: { label: string }) {
  return (
    <span
      role="tooltip"
      className="lh-dock-tooltip pointer-events-none absolute top-1/2 left-[calc(100%+10px)] z-[var(--z-dock-tooltip)] -translate-y-1/2 whitespace-nowrap rounded-md border border-line bg-card px-2.5 py-1 text-[12px] font-medium text-ink opacity-0 shadow-[0_4px_14px_rgba(2,22,61,0.12)] transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
    >
      {label}
    </span>
  );
}

function DockCard({
  children,
  className = "",
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div
      aria-label={ariaLabel}
      className={`pointer-events-auto flex w-fit flex-col items-center rounded-2xl border border-line bg-card shadow-[0_8px_28px_rgba(2,22,61,0.10),0_1px_3px_rgba(2,22,61,0.04)] ${className}`}
    >
      {children}
    </div>
  );
}

function UserMenu() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (wrapRef.current && !wrapRef.current.contains(target)) {
        setOpen(false);
      }
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open user menu"
        aria-expanded={open}
        aria-haspopup="menu"
        className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
          open ? "bg-tint" : "hover:bg-tint/80"
        }`}
      >
        <Avatar name="Longhouse" size="sm" />
        {!open ? <DockTooltip label="Account" /> : null}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className="absolute bottom-0 left-[calc(100%+10px)] z-[var(--z-dock-tooltip)] w-[12.5rem] rounded-xl border border-line bg-card p-1 shadow-[0_8px_28px_rgba(2,22,61,0.12),0_1px_3px_rgba(2,22,61,0.04)]"
        >
          {USER_MENU_LINKS.map((item) => {
            const { label, href, Icon } = item;
            const external = "external" in item && item.external;
            const className =
              "flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-tint";
            const content = (
              <>
                <Icon
                  size={MENU_ICON}
                  weight="regular"
                  aria-hidden
                  className="shrink-0 text-muted"
                />
                {label}
              </>
            );

            if (external) {
              return (
                <a
                  key={label}
                  href={href}
                  role="menuitem"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className={className}
                >
                  {content}
                </a>
              );
            }

            if (href.startsWith("#")) {
              return (
                <a
                  key={label}
                  href={href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className={className}
                >
                  {content}
                </a>
              );
            }

            return (
              <Link
                key={label}
                href={href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={className}
              >
                {content}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const accessToken = useHubAccessToken();
  const [refreshing, setRefreshing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  async function refreshData() {
    setRefreshing(true);
    setSyncError(null);
    try {
      await refreshTimeTrackingData(accessToken);
      invalidateApiCache();
      setRefreshing(false);
    } catch (error: unknown) {
      setSyncError(
        error instanceof Error ? error.message : "Sync failed. Try again."
      );
      setRefreshing(false);
    }
  }

  return (
    <div className="pointer-events-none fixed inset-y-0 left-0 z-[var(--z-dock)] flex w-[var(--dock-gutter)] flex-col justify-between px-3 py-4">
      <DockCard aria-label="Primary navigation" className="gap-1 px-1.5 pt-3 pb-2">
        <Link
          href="/"
          aria-label="Longhouse home"
          className="group relative mb-1.5 flex items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/longhouse-mark.png"
            alt=""
            width={1023}
            height={773}
            className="h-8 w-auto max-w-10 object-contain object-center"
          />
          <DockTooltip label="Home" />
        </Link>

        <nav className="flex flex-col items-center gap-0.5" aria-label="Primary">
          {NAV.map(({ href, label, Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
                  active
                    ? "bg-brand text-white"
                    : "text-muted hover:bg-tint/80 hover:text-ink"
                }`}
              >
                <Icon
                  size={DOCK_ICON}
                  weight="regular"
                  aria-hidden
                  className={
                    active
                      ? "text-white"
                      : "text-muted transition-colors group-hover:text-heading"
                  }
                />
                <DockTooltip label={label} />
              </Link>
            );
          })}
        </nav>
      </DockCard>

      <div className="pointer-events-auto flex flex-col items-center gap-2">
        {syncError ? (
          <p
            role="status"
            aria-live="polite"
            className="max-w-[7.5rem] rounded-lg border border-serious-soft bg-serious-soft px-2 py-1.5 text-center text-[11px] leading-snug text-serious"
          >
            {syncError}
          </p>
        ) : null}
        <AskAiButton />
        <DockCard aria-label="Workspace actions" className="gap-1 px-1.5 py-2">
          <button
            type="button"
            onClick={refreshData}
            disabled={refreshing}
            aria-label={refreshing ? "Syncing…" : "Sync Time Entries"}
            className="group relative flex h-10 w-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-tint/80 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-wait disabled:opacity-60"
          >
            <ArrowsClockwiseIcon
              size={DOCK_ICON}
              weight="regular"
              aria-hidden
              className={`shrink-0 transition-colors group-hover:text-accent ${
                refreshing ? "animate-spin text-accent" : "text-heading/70"
              }`}
            />
            <DockTooltip label={refreshing ? "Syncing…" : "Sync Time Entries"} />
          </button>

          <UserMenu />
        </DockCard>
      </div>
    </div>
  );
}
