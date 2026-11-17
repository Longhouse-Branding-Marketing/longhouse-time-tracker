import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyCategoryMap,
  applyCategoryMapToEntries,
  createCategoryIndex,
  entryMatchesMapping,
  isNewStructureEntry,
  isPartnerBillableReview,
  isTimeOffEntry,
  lookupTaskMap,
  mappingList,
  mergeReviewTasks,
  unmappedGroups,
  type TaskRow,
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

  it("keeps an entry exception when the rule changes", () => {
    const changed: TaskRow = {
      id: "T-test",
      oldDepartment: "Branding & Graphic Design",
      oldDepartmentMemtime: "Branding & Graphic Design (old)",
      oldRole: "Branding Specialist",
      oldTask: "Brainstorming",
      oldTaskNormalized: "Brainstorming",
      newDepartment: "Changed Department",
      newRole: "Changed Role",
      activityTypeId: "ATX",
      activityType: "Changed Activity",
      billableType: "non_billable",
      historicalBillableRule: "keep_original",
    };
    const index = createCategoryIndex({
      activityTypes: [
        {
          id: "ATX",
          name: "Changed Activity",
          billableType: "non_billable",
          existsInMemtime: true,
          isNewType: false,
          group: null,
          description: null,
          sortOrder: 1,
        },
      ],
      departments: [
        {
          oldId: "D",
          oldName: "Branding & Graphic Design",
          oldMemtimeName: "Branding & Graphic Design (old)",
          newId: "D2",
          newName: "Changed Department",
          verifiedLive: true,
        },
      ],
      roles: [],
      tasks: [changed],
    });
    const source = {
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
    };
    const ruled = applyCategoryMap(source, { index });
    assert.equal(ruled.type, "Changed Activity");
    assert.equal(ruled.mapping_status, "mapped");

    const kept = applyCategoryMapToEntries([source], {
      index,
      overrides: [
        {
          entryId: 2,
          department: "Branding & Graphic Design",
          role: "Branding Specialist",
          activityType: "Brainstorming and Idea Generation",
          billable: null,
        },
      ],
    })[0];
    assert.equal(kept.mapping_status, "override");
    assert.equal(kept.type, "Brainstorming and Idea Generation");
    assert.equal(kept.department, "Branding & Graphic Design");
    assert.equal(kept.role, "Branding Specialist");
    assert.equal(kept.raw_task, "Brainstorming");
  });

  it("changes billable without leaving the mapped category", () => {
    const source = {
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
    };
    const mapped = applyCategoryMap(source, {
      override: {
        entryId: 2,
        department: null,
        role: null,
        activityType: null,
        billable: "Billable",
      },
    });
    assert.equal(mapped.mapping_status, "mapped");
    assert.equal(mapped.type, "Brainstorming and Idea Generation");
    assert.equal(mapped.billable, "Billable");
    assert.equal(mapped.is_billable, true);
    assert.equal(mapped.raw_billable, "Non-Billable");
  });

  it("drops a partner row once its billable exception is Billable", () => {
    const source = {
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
    };
    const marked = applyCategoryMap(source, {
      override: {
        entryId: 3,
        department: null,
        role: null,
        activityType: null,
        billable: "Billable",
      },
    });
    assert.equal(isPartnerBillableReview(marked), false);
    assert.equal(marked.raw_task, "Partner Onboarding");
  });

  it("leaves overridden rows out of the unmapped list", () => {
    const source = {
      id: 9,
      person: "Mary",
      date: "2026-01-05",
      department: "Nope",
      role: "Nope",
      task: "Nope",
      type: null,
      billable: "Non-Billable",
      hours: 1.5,
      comments: null,
      is_billable: false,
      year_month: "2026-01",
      source_time_range: null,
    };
    const plain = applyCategoryMap(source);
    assert.equal(plain.mapping_status, "unmapped");
    assert.equal(unmappedGroups([plain]).length, 1);

    const fixed = applyCategoryMap(source, {
      override: {
        entryId: 9,
        department: "SEO",
        role: "Specialist",
        activityType: "SEO Audit",
        billable: null,
      },
    });
    assert.equal(fixed.mapping_status, "override");
    assert.equal(unmappedGroups([fixed]).length, 0);

    const emptyIndex = createCategoryIndex({
      activityTypes: [],
      departments: [],
      roles: [],
      tasks: [],
    });
    assert.equal(mappingList(emptyIndex, [fixed]).length, 0);

    const stillOpen = applyCategoryMap({ ...source, id: 10 });
    const mixed = mappingList(emptyIndex, [fixed, stillOpen]);
    assert.equal(mixed.length, 1);
    assert.equal(mixed[0]?.status, "unmapped");
    assert.equal(mixed[0]?.entries, 1);
    assert.equal(mixed[0]?.exceptions, 0);

    const unmappedScope = {
      ruleId: null,
      department: "Nope",
      role: "Nope",
      task: "Nope",
    };
    assert.equal(entryMatchesMapping(stillOpen, unmappedScope, emptyIndex), true);
    assert.equal(entryMatchesMapping(fixed, unmappedScope, emptyIndex), false);
  });

  it("maps a logged row that has no task", () => {
    const index = createCategoryIndex({
      activityTypes: [
        {
          id: "AT",
          name: "SEO Blog Copywriting",
          billableType: "billable",
          existsInMemtime: true,
          isNewType: false,
          group: null,
          description: null,
          sortOrder: 1,
        },
      ],
      departments: [
        {
          oldId: "SEO",
          oldName: "SEO",
          oldMemtimeName: "SEO",
          newId: "SEO",
          newName: "SEO",
          verifiedLive: true,
        },
      ],
      roles: [],
      tasks: [
        {
          id: "U1",
          oldDepartment: "SEO",
          oldDepartmentMemtime: "SEO",
          oldRole: "Copywriter",
          oldTask: "",
          oldTaskNormalized: "",
          newDepartment: "SEO",
          newRole: "Specialist",
          activityTypeId: "AT",
          activityType: "SEO Blog Copywriting",
          billableType: "billable",
          historicalBillableRule: "keep_original",
        },
      ],
    });
    const mapped = applyCategoryMap(
      {
        id: 11,
        person: "Sample",
        date: "2026-03-01",
        department: "SEO",
        role: "Copywriter",
        task: null,
        type: null,
        billable: "Non-Billable",
        hours: 1,
        comments: "Draft outline",
        is_billable: false,
        year_month: "2026-03",
        source_time_range: null,
      },
      { index }
    );
    assert.equal(mapped.mapping_status, "mapped");
    assert.equal(mapped.type, "SEO Blog Copywriting");
    assert.equal(mapped.role, "Specialist");
    assert.equal(mapped.raw_task, null);
    assert.equal(lookupTaskMap("SEO", "Copywriter", null, index)?.id, "U1");
  });
});

describe("mergeReviewTasks", () => {
  it("keeps optimistic local rules missing from a stale server payload", () => {
    const server = [
      {
        id: "U1",
        oldDepartment: "SEO",
        oldDepartmentMemtime: "SEO",
        oldRole: "Copywriter",
        oldTask: "Blog",
        oldTaskNormalized: "Blog",
        newDepartment: "SEO",
        newRole: "Specialist",
        activityTypeId: "AT1",
        activityType: "SEO Blog Copywriting",
        billableType: "billable",
        historicalBillableRule: "keep_original",
      },
    ];
    const local = [
      ...server,
      {
        id: "local-admin",
        oldDepartment: "Administrative",
        oldDepartmentMemtime: "Administrative",
        oldRole: null,
        oldTask: "Inbox",
        oldTaskNormalized: "Inbox",
        newDepartment: "Operations",
        newRole: "Coordinator",
        activityTypeId: "AT2",
        activityType: "Internal Admin",
        billableType: "non_billable",
        historicalBillableRule: "keep_original",
      },
    ];
    const merged = mergeReviewTasks(server, local);
    assert.equal(merged.length, 2);
    assert.equal(merged[1]?.oldDepartment, "Administrative");
    assert.equal(mergeReviewTasks(local, local).length, 2);
  });

  it("flags Employee Time Off and Time off -* tasks, not Time Off Review", () => {
    assert.equal(
      isTimeOffEntry({ type: "Employee Time Off", task: "Anything" }),
      true
    );
    assert.equal(
      isTimeOffEntry({ type: null, task: "Time off - Vacation" }),
      true
    );
    assert.equal(
      isTimeOffEntry({ type: "Administrative", task: "Time Off Review" }),
      false
    );

    const vacation = applyCategoryMap({
      id: 90,
      person: "Mary",
      date: "2026-07-01",
      department: "Operations",
      role: "Team",
      task: "Time off - Vacation",
      type: null,
      billable: "Non-Billable",
      hours: 8,
      comments: null,
      is_billable: false,
      year_month: "2026-07",
      source_time_range: null,
    });
    assert.equal(vacation.is_time_off, true);
    assert.equal(vacation.type, "Employee Time Off");

    const review = applyCategoryMap({
      id: 91,
      person: "Mary",
      date: "2026-07-02",
      department: "Operations",
      role: "Specialist",
      task: "Time Off Review",
      type: "Administrative",
      billable: "Non-Billable",
      hours: 0.2,
      comments: null,
      is_billable: false,
      year_month: "2026-07",
      source_time_range: null,
    });
    assert.equal(review.is_time_off, false);
  });
});
