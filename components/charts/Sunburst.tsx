"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  hierarchy,
  partition,
  type HierarchyRectangularNode,
} from "d3-hierarchy";
import { arc } from "d3-shape";
import { BRAND, CHART_BLUES } from "@/lib/brand";
import { hours as fmtHours, pct } from "@/lib/formatters";
import type { HierarchyNode } from "@/lib/aggregate";
import { ChartEmpty } from "./ChartEmpty";

type Node = HierarchyRectangularNode<HierarchyNode>;

interface ArcPoint {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

interface SideItem {
  name: string;
  hours: number;
  color: string;
  node: Node | null;
}

const DEPTH_LABEL = ["", "Department", "Role", "Task"] as const;
const ANIM_MS = 750;
const CORNER_RADIUS = 5;

function lighten(hex: string, t: number): string {
  // Mix toward a soft #22BBF2 tint (not pure white) so outer rings stay cyan.
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const soft = BRAND.accentSoft.replace("#", "");
  const tr = parseInt(soft.slice(0, 2), 16);
  const tg = parseInt(soft.slice(2, 4), 16);
  const tb = parseInt(soft.slice(4, 6), 16);
  const mix = (c: number, target: number) => Math.round(c + (target - c) * t);
  return `rgb(${mix(r, tr)}, ${mix(g, tg)}, ${mix(b, tb)})`;
}

function nodeTotal(node: HierarchyNode): number {
  if (node.value != null) return node.value;
  return (node.children ?? []).reduce((sum, c) => sum + nodeTotal(c), 0);
}

function nodeKey(node: Node): string {
  return (node.ancestors() as Node[])
    .map((n) => n.data.name)
    .reverse()
    .join("›");
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpArc(a: ArcPoint, b: ArcPoint, t: number): ArcPoint {
  return {
    x0: lerp(a.x0, b.x0, t),
    x1: lerp(a.x1, b.x1, t),
    y0: lerp(a.y0, b.y0, t),
    y1: lerp(a.y1, b.y1, t),
  };
}

/**
 * Remap layout so `focus` fills the full circle. y0/y1 are in pixels so
 * remaining depth always stretches from the center hole to the outer radius.
 * At the true root we skip the invisible root band so departments start at the hole.
 */
function targetFor(
  d: Node,
  focus: Node,
  radius: number,
  holeR: number
): ArcPoint {
  const span = focus.x1 - focus.x0 || 1;
  const skipRootBand = focus.depth === 0 ? 1 : 0;
  const depthSpan = Math.max(1, focus.height + 1 - skipRootBand);
  const ring = (radius - holeR) / depthSpan;
  const rel0 = Math.max(0, d.y0 - focus.depth - skipRootBand);
  const rel1 = Math.max(0, d.y1 - focus.depth - skipRootBand);
  return {
    x0: Math.max(0, Math.min(1, (d.x0 - focus.x0) / span)) * 2 * Math.PI,
    x1: Math.max(0, Math.min(1, (d.x1 - focus.x0) / span)) * 2 * Math.PI,
    y0: holeR + rel0 * ring,
    y1: holeR + rel1 * ring,
  };
}

function breadcrumb(node: Node): Node[] {
  return (node.ancestors() as Node[]).reverse().filter((n) => n.depth >= 1);
}

function buildDisplay(
  root: Node,
  focus: Node,
  radius: number,
  holeR: number
): Map<string, ArcPoint> {
  const map = new Map<string, ArcPoint>();
  for (const d of root.descendants() as Node[]) {
    map.set(nodeKey(d), targetFor(d, focus, radius, holeR));
  }
  return map;
}

export function Sunburst({
  data,
  size = 440,
}: {
  data: HierarchyNode;
  size?: number;
}) {
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [display, setDisplay] = useState<Map<string, ArcPoint>>(new Map());
  const [tooltip, setTooltip] = useState<{
    name: string;
    x: number;
    y: number;
  } | null>(null);

  const displayRef = useRef(display);
  displayRef.current = display;
  const animRef = useRef<number | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [listMaxHeight, setListMaxHeight] = useState<number | null>(null);
  const radius = size / 2;
  const holeR = radius * 0.22;

  const chart = useMemo(() => {
    const rootNode = hierarchy<HierarchyNode>(data)
      .sum((d) => d.value ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    partition<HierarchyNode>().size([2 * Math.PI, rootNode.height + 1])(
      rootNode
    );

    const colorOf = new Map<Node, string>();
    const byKey = new Map<string, Node>();
    const departments: SideItem[] = [];

    (rootNode.children ?? []).forEach((dept, i) => {
      const base = CHART_BLUES[i % CHART_BLUES.length];
      departments.push({
        name: dept.data.name,
        hours: nodeTotal(dept.data),
        color: base,
        node: dept as Node,
      });
      dept.each((node) => {
        const n = node as Node;
        colorOf.set(n, lighten(base, Math.max(0, node.depth - 1) * 0.16));
        byKey.set(nodeKey(n), n);
      });
    });

    byKey.set(nodeKey(rootNode as Node), rootNode as Node);
    departments.sort((a, b) => b.hours - a.hours);

    const arcs = (rootNode.descendants() as Node[]).filter((d) => d.depth >= 1);

    return {
      root: rootNode as Node,
      arcs,
      colorOf,
      byKey,
      total: rootNode.value ?? 0,
      hasData: arcs.length > 0,
      departments,
    };
  }, [data]);

  // Seed / reset display when data changes
  useEffect(() => {
    setFocusKey(null);
    setDisplay(buildDisplay(chart.root, chart.root, radius, holeR));
    setListMaxHeight(null);
  }, [chart, radius, holeR]);

  const focus = focusKey ? (chart.byKey.get(focusKey) ?? chart.root) : chart.root;

  function animateTo(nextFocus: Node) {
    if (animRef.current != null) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }

    const from = new Map(displayRef.current);
    const to = buildDisplay(chart.root, nextFocus, radius, holeR);
    for (const [key, target] of to) {
      if (!from.has(key)) from.set(key, target);
    }

    const start = performance.now();
    const tick = (now: number) => {
      const t = easeOutCubic(Math.min(1, (now - start) / ANIM_MS));
      const next = new Map<string, ArcPoint>();
      for (const [key, target] of to) {
        next.set(key, lerpArc(from.get(key) ?? target, target, t));
      }
      setDisplay(next);
      if (t < 1) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        animRef.current = null;
      }
    };
    animRef.current = requestAnimationFrame(tick);
  }

  useEffect(() => {
    return () => {
      if (animRef.current != null) cancelAnimationFrame(animRef.current);
    };
  }, []);

  const zoomTo = (node: Node) => {
    const key = node === chart.root ? null : nodeKey(node);
    setFocusKey(key);
    animateTo(node);
  };

  const reset = () => zoomTo(chart.root);

  const zoomOut = () => {
    if (focus.depth === 0) return;
    zoomTo((focus.parent as Node | null) ?? chart.root);
  };

  const arcGen = useMemo(
    () =>
      arc<ArcPoint>()
        .startAngle((d) => d.x0)
        .endAngle((d) => d.x1)
        .padAngle((d) => Math.min((d.x1 - d.x0) / 2, 0.008))
        .padRadius(radius / 2)
        .innerRadius((d) => d.y0 + 0.5)
        .outerRadius((d) => Math.max(d.y0 + 1, d.y1 - 1.5))
        .cornerRadius(CORNER_RADIUS),
    [radius]
  );

  const panelItems: SideItem[] = useMemo(() => {
    if (focus.depth === 0) return chart.departments;
    if (!focus.children?.length) {
      return [
        {
          name: focus.data.name,
          hours: focus.value ?? 0,
          color: chart.colorOf.get(focus) ?? BRAND.accentDeep,
          node: focus,
        },
      ];
    }
    return ((focus.children ?? []) as Node[])
      .map((c) => ({
        name: c.data.name,
        hours: c.value ?? 0,
        color: chart.colorOf.get(c) ?? BRAND.accentDeep,
        node: c,
      }))
      .sort((a, b) => b.hours - a.hours);
  }, [focus, chart.departments, chart.colorOf]);

  // Lock side-panel list height to the department-level size
  useEffect(() => {
    if (focus.depth !== 0 || listMaxHeight != null) return;
    const el = listRef.current;
    if (!el) return;
    const frame = requestAnimationFrame(() => {
      if (el.scrollHeight > 0) setListMaxHeight(el.scrollHeight);
    });
    return () => cancelAnimationFrame(frame);
  }, [focus.depth, panelItems.length, listMaxHeight]);

  const panelLabel =
    focus.depth === 0
      ? "Department"
      : !focus.children?.length
        ? (DEPTH_LABEL[Math.min(focus.depth, 3)] ?? "Task")
        : (DEPTH_LABEL[Math.min(focus.depth + 1, 3)] ?? "Task");

  const crumbs = focus.depth > 0 ? breadcrumb(focus) : [];
  const centerHours = focus.value ?? chart.total;
  const panelTotal = focus.value ?? chart.total;

  if (!chart.hasData) {
    return <ChartEmpty message="No department data for this selection" />;
  }

  return (
    <div className="flex flex-col gap-7 lg:flex-row lg:items-center lg:gap-10">
      <div className="relative mx-auto w-full max-w-[480px] shrink-0 lg:mx-0 lg:w-[min(100%,480px)]">
        <svg
          width={size}
          height={size}
          viewBox={`${-radius} ${-radius} ${size} ${size}`}
          className="block h-auto w-full"
          aria-label="Time by department, role, and task"
          onMouseLeave={() => setTooltip(null)}
        >
          {chart.arcs.map((d) => {
            const key = nodeKey(d);
            const coords = display.get(key);
            if (!coords) return null;
            const span = coords.x1 - coords.x0;
            // Skip collapsed / fully-hidden arcs (outside the focused subtree)
            if (span <= 0.002 || coords.y1 - coords.y0 < 1) return null;

            const isFocus = focusKey === key;
            const path = arcGen(coords);
            if (!path) return null;

            return (
              <path
                key={key}
                d={path}
                fill={chart.colorOf.get(d) ?? BRAND.accentDeep}
                stroke={BRAND.white}
                strokeWidth={isFocus ? 2.5 : 1.5}
                style={{ cursor: "pointer" }}
                onClick={() => {
                  if (d === focus) {
                    zoomOut();
                    return;
                  }
                  zoomTo(d);
                }}
                onMouseEnter={(event) => {
                  const host =
                    event.currentTarget.ownerSVGElement?.parentElement;
                  if (!host) return;
                  const rect = host.getBoundingClientRect();
                  setTooltip({
                    name: d.data.name,
                    x: event.clientX - rect.left,
                    y: event.clientY - rect.top,
                  });
                }}
                onMouseMove={(event) => {
                  const host =
                    event.currentTarget.ownerSVGElement?.parentElement;
                  if (!host) return;
                  const rect = host.getBoundingClientRect();
                  setTooltip({
                    name: d.data.name,
                    x: event.clientX - rect.left,
                    y: event.clientY - rect.top,
                  });
                }}
              />
            );
          })}

          <circle
            r={holeR}
            fill={BRAND.white}
            className={focus.depth > 0 ? "cursor-pointer" : undefined}
            onClick={zoomOut}
            onMouseEnter={() => setTooltip(null)}
          />
          <text
            textAnchor="middle"
            dominantBaseline="middle"
            y={-5}
            fontSize={18}
            fontWeight={600}
            fill={BRAND.ink}
            pointerEvents="none"
          >
            {fmtHours(centerHours).replace(" h", "")}
          </text>
          <text
            textAnchor="middle"
            dominantBaseline="middle"
            y={13}
            fontSize={10}
            fontWeight={500}
            fill={BRAND.muted}
            pointerEvents="none"
          >
            {focus.depth > 0 ? "Back" : "Hours"}
          </text>
        </svg>
        {tooltip ? (
          <div
            className="pointer-events-none absolute z-10 max-w-[220px] truncate rounded-md border border-line bg-card px-2.5 py-1.5 text-[12px] font-medium text-ink shadow-[0_4px_12px_rgba(2,22,61,0.12)]"
            style={{
              left: tooltip.x + 12,
              top: tooltip.y + 12,
            }}
          >
            {tooltip.name}
          </div>
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        {crumbs.length > 0 ? (
          <div className="lh-breadcrumb mb-3 flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <button
              type="button"
              className="text-brand-600 hover:underline"
              onClick={reset}
            >
              All
            </button>
            {crumbs.map((node, i) => (
              <span
                key={nodeKey(node)}
                className="inline-flex items-center gap-x-1.5"
              >
                <span className="text-muted">›</span>
                <button
                  type="button"
                  className={
                    i === crumbs.length - 1
                      ? "font-semibold text-ink"
                      : "text-brand-600 hover:underline"
                  }
                  onClick={() => zoomTo(node)}
                >
                  {node.data.name}
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={reset}
              className="ml-2 rounded-md px-2 py-0.5 font-semibold text-brand-600 transition-colors hover:bg-tint"
            >
              Reset
            </button>
          </div>
        ) : null}

        <h3 className="lh-section-title">{panelLabel}</h3>

        <ul
          ref={listRef}
          className="mt-3 space-y-1 overflow-y-auto"
          style={listMaxHeight != null ? { maxHeight: listMaxHeight } : undefined}
        >
          {panelItems.map((item) => {
            const share =
              panelTotal > 0 ? Math.round((100 * item.hours) / panelTotal) : 0;
            const isActive =
              item.node != null && focusKey === nodeKey(item.node);
            return (
              <li key={item.name}>
                <button
                  type="button"
                  className={`flex w-full items-start gap-x-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-tint lg:w-fit lg:max-w-full ${
                    isActive ? "bg-tint" : ""
                  }`}
                  onClick={() => {
                    if (!item.node) return;
                    if (item.node === focus) zoomOut();
                    else zoomTo(item.node);
                  }}
                >
                  <span
                    className="mt-1 h-2.5 w-2.5 shrink-0 rounded-[3px]"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="min-w-0 text-[13px] leading-snug text-ink lg:max-w-[28rem]">
                    {item.name}
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-[13px] tabular-nums text-muted">
                    {fmtHours(item.hours)} · {pct(share)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
