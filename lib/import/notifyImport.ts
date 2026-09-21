/** Browser notification + tab title flash after a long import. */

export function requestImportNotificationPermission(): void {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return;
  }
  if (Notification.permission === "default") {
    void Notification.requestPermission();
  }
}

export function notifyImportComplete(opts: {
  fileName: string;
  inserted: number;
  elapsedMs: number;
}): void {
  const insertedLabel =
    opts.inserted === 1 ? "1 new row" : `${opts.inserted.toLocaleString()} new rows`;
  const title = "Import complete";
  const body = `${insertedLabel} from ${opts.fileName}. Dashboard is up to date.`;

  if (typeof document !== "undefined") {
    const previous = document.title;
    document.title = `${title} · Time Tracking`;
    window.setTimeout(() => {
      if (document.title.startsWith(title)) {
        document.title = previous;
      }
    }, 12_000);
  }

  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return;
  }
  if (Notification.permission !== "granted") return;

  try {
    new Notification(title, {
      body,
      tag: "lh-import-complete",
    });
  } catch {
    // Private mode / unsupported Notification constructor.
  }
}
