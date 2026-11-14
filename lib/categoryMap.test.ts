import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyCategoryMap,
  isNewStructureEntry,
  isPartnerBillableReview,
  lookupTaskMap,
} from "./categoryMap.ts";

describe("category crosswalk", () => {
  it("maps Reporting to Partner Results Reporting and renames Digital Advertising", () => {
    const seoOps = lookupTaskMap("SEO", "Operations Manager", "Reporting");
    const adsResults = lookupTaskMap(
      "Digital Advertising",
      "Results Manager",
      "Reporting"
    );
    assert.equal(seoOps?.activityType, "Partner Results Reporting");
    assert.equal(seoOps?.newDepartment, "SEO");
    assert.equal(adsResults?.activityType, "Partner Results Reporting");
    assert.equal(adsResults?.newDepartment, "Advertising");
  });

  it("matches the Memtime (old) department name and a task with no role", () => {
    const row = lookupTaskMap("Web Design (old)", "", "Offboarding");
    assert.equal(row?.newDepartment, "Web Design");
    assert.equal(row?.newRole, "Department Manager");
    assert.equal(row?.activityType, "Partner Off-boarding & Cancellation");
  });

  it("keeps new-structure entries on their logged activity type", () => {
    assert.equal(isNewStructureEntry("SEO", "SEO Audit"), true);
    assert.equal(isNewStructureEntry("Digital Advertising", "SEO Audit"), false);
    assert.equal(isNewStructureEntry("SEO (old)", "SEO Audit"), false);

    const mapped = applyCategoryMap({
      id: 1,
      person: "Mary",
      date: "2026-11-01",
      department: "SEO",
      role: "Specialist",
      task: "Old leftover",
      type: "SEO Audit",
      billable: "Billable",
      hours: 1,
      comments: null,
      is_billable: true,
      year_month: "2026-11",
      source_time_range: null,
    });
    assert.equal(mapped.mapping_status, "new_structure");
    assert.equal(mapped.type, "SEO Audit");
    assert.equal(mapped.department, "SEO");
  });

  it("maps an old task and keeps the original names", () => {
    const mapped = applyCategoryMap({
      id: 2,
      person: "Mary",
      date: "2026-01-05",
      department: "Branding & Graphic Design",
      role: "Branding Specialist",
      task: "Brainstorming",
      type: null,
      billable: "Non-Billable",
      hours: 2,
      comments: null,
      is_billable: false,
      year_month: "2026-01",
      source_time_range: null,
    });
    assert.equal(mapped.mapping_status, "mapped");
    assert.equal(mapped.type, "Brainstorming and Idea Generation");
    assert.equal(mapped.raw_task, "Brainstorming");
    assert.equal(mapped.department, "Branding & Graphic Design");
  });

  it("flags partner only from original logged names", () => {
    const original = applyCategoryMap({
      id: 3,
      person: "Mary",
      date: "2026-01-05",
      department: "Sales",
      role: "Growth Consultant",
      task: "Partner Onboarding",
      type: "Meeting",
      billable: "Non-Billable",
      hours: 1,
      comments: null,
      is_billable: false,
      year_month: "2026-01",
      source_time_range: null,
    });
    assert.equal(isPartnerBillableReview(original), true);

    const renamedOnly = applyCategoryMap({
      id: 4,
      person: "Mary",
      date: "2026-01-05",
      department: "Web Design",
      role: "Results Manager",
      task: "Onboarding",
      type: null,
      billable: "Non-Billable",
      hours: 1,
      comments: null,
      is_billable: false,
      year_month: "2026-01",
      source_time_range: null,
    });
    assert.equal(renamedOnly.type, "Partner Onboarding");
    assert.equal(isPartnerBillableReview(renamedOnly), false);
  });
});
