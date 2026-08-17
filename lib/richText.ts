import type { ReactNode } from "react";
import { createElement } from "react";

/** Convert contenteditable HTML to lightweight markdown for chat payloads. */
export function htmlToMarkdown(root: HTMLElement): string {
  function walk(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent ?? "";
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const inner = Array.from(el.childNodes).map(walk).join("");

    if (tag === "br") return "\n";
    if (tag === "b" || tag === "strong") return `**${inner}**`;
    if (tag === "i" || tag === "em") return `*${inner}*`;
    if (tag === "div" || tag === "p") {
      return inner.endsWith("\n") ? inner : `${inner}\n`;
    }
    return inner;
  }

  return Array.from(root.childNodes)
    .map(walk)
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Set plain or markdown text into a contenteditable root. */
export function setEditorText(root: HTMLElement, text: string): void {
  root.textContent = text;
}

export function isEditorEmpty(root: HTMLElement): boolean {
  return !(root.textContent ?? "").trim();
}

/** Render **bold** and *italic* in chat bubbles. */
export function renderChatMarkdown(text: string): ReactNode {
  const parts: ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[1]) {
      parts.push(createElement("strong", { key: key++ }, match[1]));
    } else if (match[2]) {
      parts.push(createElement("em", { key: key++ }, match[2]));
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 ? parts[0] : parts;
}
