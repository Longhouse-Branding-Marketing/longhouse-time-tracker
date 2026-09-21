import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatElapsed,
  parseSseBuffer,
} from "./import-stream.ts";

describe("formatElapsed", () => {
  it("formats seconds and minutes", () => {
    assert.equal(formatElapsed(900), "1 sec");
    assert.equal(formatElapsed(59_400), "59 sec");
    assert.equal(formatElapsed(60_000), "1 min");
    assert.equal(formatElapsed(134_000), "2 min 14 sec");
  });
});

describe("parseSseBuffer", () => {
  it("keeps a trailing partial event in rest", () => {
    const first = parseSseBuffer(
      'data: {"type":"progress","phase":"inserting","done":100,"total":400,"label":"Importing Rows…"}\n\ndata: {"type":"comp'
    );
    assert.equal(first.events.length, 1);
    assert.equal(first.events[0]?.type, "progress");
    if (first.events[0]?.type === "progress") {
      assert.equal(first.events[0].done, 100);
      assert.equal(first.events[0].total, 400);
    }
    assert.equal(first.rest.startsWith("data: {"), true);

    const second = parseSseBuffer(
      `${first.rest}lete","result":{"ok":true,"processed":400,"inserted":300,"skippedDuplicate":100,"rejected":0}}\n\n`
    );
    assert.equal(second.events.length, 1);
    assert.equal(second.events[0]?.type, "complete");
    assert.equal(second.rest, "");
  });

  it("joins multi-line data payloads", () => {
    const { events } = parseSseBuffer(
      'data: {"type":"error",\ndata: "error":"failed"}\n\n'
    );
    assert.equal(events.length, 1);
    assert.deepEqual(events[0], { type: "error", error: "failed" });
  });
});
