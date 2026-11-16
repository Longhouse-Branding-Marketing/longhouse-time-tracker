import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseMemtimeCsv, splitBookedOnPath } from "./memtime.ts";

const NEW_HEADER =
  "User,Booked on,Position,Logged Time,Time,Date,Activity Type,Type of Logged Work,Billable,Comment";

describe("Memtime time tracking report", () => {
  it("splits a path and keeps a slash inside the task", () => {
    assert.deepEqual(splitBookedOnPath("Web Design / Specialist"), {
      department: "Web Design",
      role: "Specialist",
      task: null,
    });
    assert.deepEqual(
      splitBookedOnPath(
        "Branding & Graphic Design (old) / Graphic Design Specialist / Flyer / Brochure Design"
      ),
      {
        department: "Branding & Graphic Design (old)",
        role: "Graphic Design Specialist",
        task: "Flyer / Brochure Design",
      }
    );
  });

  it("reads one Booked on column plus Activity Type and Yes/No", () => {
    const csv = [
      NEW_HEADER,
      'jayden@longhouse.co,Web Design / Specialist,,15,3:45 p.m. - 4:00 p.m.,2026-11-09,Website Page Revisions,Billable,Yes,Notes',
      'jayden@longhouse.co,SEO (old) / Copywriter / Blog Writing,,30,1:00 p.m. - 1:30 p.m.,2026-11-08,,Non-Billable,No,',
    ].join("\n");
    const parsed = parseMemtimeCsv(csv);
    assert.equal(parsed.rejected.length, 0);
    assert.equal(parsed.valid.length, 2);
    assert.equal(parsed.valid[0]?.insert.department, "Web Design");
    assert.equal(parsed.valid[0]?.insert.role, "Specialist");
    assert.equal(parsed.valid[0]?.insert.task, null);
    assert.equal(parsed.valid[0]?.insert.type, "Website Page Revisions");
    assert.equal(parsed.valid[0]?.insert.billable, "Billable");
    assert.equal(parsed.valid[0]?.insert.hours, 0.25);
    assert.equal(parsed.valid[1]?.insert.department, "SEO (old)");
    assert.equal(parsed.valid[1]?.insert.role, "Copywriter");
    assert.equal(parsed.valid[1]?.insert.task, "Blog Writing");
    assert.equal(parsed.valid[1]?.insert.billable, "Non-Billable");
  });

  it("still reads separate Booked on columns", () => {
    const csv = [
      "User,Booked on,Booked on,Booked on,Logged Time,Time,Date,Type of Logged Work",
      "Mary,SEO,Specialist,Reporting,60,9:00 a.m. - 10:00 a.m.,2026-01-05,Billable",
    ].join("\n");
    const parsed = parseMemtimeCsv(csv);
    assert.equal(parsed.rejected.length, 0);
    assert.equal(parsed.valid[0]?.insert.department, "SEO");
    assert.equal(parsed.valid[0]?.insert.role, "Specialist");
    assert.equal(parsed.valid[0]?.insert.task, "Reporting");
    assert.equal(parsed.valid[0]?.insert.billable, "Billable");
  });
});
