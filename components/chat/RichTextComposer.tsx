"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type KeyboardEvent,
} from "react";
import { TextBIcon, TextItalicIcon } from "@phosphor-icons/react";
import { htmlToMarkdown, isEditorEmpty, setEditorText } from "@/lib/richText";

export type RichTextComposerHandle = {
  focus: () => void;
  select: () => void;
  clear: () => void;
  getMarkdown: () => string;
  isEmpty: () => boolean;
};

type RichTextComposerProps = {
  initialValue?: string;
  placeholder?: string;
  disabled?: boolean;
  onValueChange?: (markdown: string) => void;
  onSubmit?: () => void;
};

export const RichTextComposer = forwardRef<
  RichTextComposerHandle,
  RichTextComposerProps
>(function RichTextComposer(
  { initialValue = "", placeholder, disabled, onValueChange, onSubmit },
  ref
) {
  const editorRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    focus() {
      editorRef.current?.focus();
    },
    select() {
      const el = editorRef.current;
      if (!el) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    },
    clear() {
      const el = editorRef.current;
      if (!el) return;
      el.innerHTML = "";
      onValueChange?.("");
    },
    getMarkdown() {
      const el = editorRef.current;
      return el ? htmlToMarkdown(el) : "";
    },
    isEmpty() {
      const el = editorRef.current;
      return el ? isEditorEmpty(el) : true;
    },
  }));

  useEffect(() => {
    const el = editorRef.current;
    if (!el || el.textContent) return;
    if (initialValue) setEditorText(el, initialValue);
  }, [initialValue]);

  function syncValue() {
    const el = editorRef.current;
    if (!el) return;
    onValueChange?.(htmlToMarkdown(el));
  }

  function applyFormat(command: "bold" | "italic") {
    if (disabled) return;
    editorRef.current?.focus();
    document.execCommand(command, false);
    syncValue();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit?.();
    }
  }

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1.5 flex items-center gap-0.5 px-1">
        <button
          type="button"
          aria-label="Bold"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyFormat("bold")}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-tint hover:text-ink disabled:opacity-40"
        >
          <TextBIcon size={14} weight="bold" aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Italic"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyFormat("italic")}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-tint hover:text-ink disabled:opacity-40"
        >
          <TextItalicIcon size={14} weight="bold" aria-hidden />
        </button>
      </div>
      <div
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={syncValue}
        onKeyDown={onKeyDown}
        data-placeholder={placeholder}
        className="lh-rich-composer max-h-28 min-h-[64px] overflow-y-auto px-1 py-1.5 text-[12.5px] leading-relaxed text-ink outline-none empty:before:text-muted empty:before:content-[attr(data-placeholder)] disabled:opacity-60 [&_em]:italic [&_strong]:font-semibold"
      />
    </div>
  );
});
