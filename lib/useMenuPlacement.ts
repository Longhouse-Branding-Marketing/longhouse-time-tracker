"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

export type MenuPlacement = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  openUp: boolean;
};

const GAP = 6;
const MAX_HEIGHT = 224; // ~max-h-56
const VIEWPORT_PAD = 12;

/** Fixed-position menu coords so the panel can portal above overflow containers. */
export function useMenuPlacement(
  anchorRef: RefObject<HTMLElement | null>,
  open: boolean
): MenuPlacement | null {
  const [placement, setPlacement] = useState<MenuPlacement | null>(null);

  useLayoutEffect(() => {
    if (!open) return;

    function update() {
      const node = anchorRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_PAD;
      const spaceAbove = rect.top - VIEWPORT_PAD;
      const openUp = spaceBelow < Math.min(MAX_HEIGHT, 160) && spaceAbove > spaceBelow;
      const maxHeight = Math.max(
        120,
        Math.min(MAX_HEIGHT, openUp ? spaceAbove - GAP : spaceBelow - GAP)
      );
      const top = openUp
        ? Math.max(VIEWPORT_PAD, rect.top - GAP - maxHeight)
        : rect.bottom + GAP;
      setPlacement({
        top,
        left: rect.left,
        width: rect.width,
        maxHeight,
        openUp,
      });
    }

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchorRef, open]);

  return open ? placement : null;
}
