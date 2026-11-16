import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  activeEmployeeEntries,
  collapsePersonOptions,
  normalizeEntryPerson,
  normalizeEntriesPeople,
  personMatchesSelection,
} from "./personLabels.ts";

describe("collapsePersonOptions", () => {
  it("drops emails when a matching name already exists", () => {
    assert.deepEqual(
      collapsePersonOptions([
        "natasha@longhouse.co",
        "Natasha",
        "Nick",
        "nick@longhouse.co",
        "Matt",
        "Simran Rai",
      ]),
      ["Matt", "Natasha", "Nick", "Simran Rai"]
    );
  });

  it("keeps emails that have no name counterpart", () => {
    assert.deepEqual(collapsePersonOptions(["keenan@longhouse.co", "Matt"]), [
      "keenan@longhouse.co",
      "Matt",
    ]);
  });
});

describe("personMatchesSelection", () => {
  it("matches email rows when the preferred name is selected", () => {
    const selected = new Set(["Natasha", "Nick"]);
    assert.equal(personMatchesSelection("Natasha", selected), true);
    assert.equal(personMatchesSelection("natasha@longhouse.co", selected), true);
    assert.equal(personMatchesSelection("nick@longhouse.co", selected), true);
    assert.equal(personMatchesSelection("Matt", selected), false);
  });
});

describe("normalizeEntryPerson", () => {
  const directory = [
    { person: "Natasha", alsoKnownAs: ["natasha@longhouse.co"] },
    { person: "Victor", alsoKnownAs: ["victor@longhouse.co"] },
    { person: "Simran Rai", alsoKnownAs: ["Simran", "simran@longhouse.co"] },
  ];
  const known = ["Natasha", "Nick", "Victor", "Simran Rai", "natasha@longhouse.co"];

  it("resolves directory emails onto preferred names", () => {
    assert.equal(
      normalizeEntryPerson("natasha@longhouse.co", directory, known),
      "Natasha"
    );
    assert.equal(
      normalizeEntryPerson("victor@longhouse.co", directory, known),
      "Victor"
    );
  });

  it("collapses email peers onto dataset names outside the directory", () => {
    assert.equal(normalizeEntryPerson("nick@longhouse.co", directory, known), "Nick");
  });
});

describe("normalizeEntriesPeople", () => {
  it("rewrites email person labels on entries", () => {
    const entries = [
      { id: 1, person: "natasha@longhouse.co", date: "2026-11-01" },
      { id: 2, person: "Nick", date: "2026-11-01" },
      { id: 3, person: "nick@longhouse.co", date: "2026-11-02" },
    ] as Array<{ id: number; person: string; date: string }>;

    const employees = [
      {
        id: 1,
        person: "Natasha",
        photo_url: null,
        active: true,
        start_date: null,
        end_date: null,
        notes: null,
        also_known_as: ["natasha@longhouse.co"],
      },
    ];

    const normalized = normalizeEntriesPeople(entries as never, employees as never);
    assert.equal(normalized[0].person, "Natasha");
    assert.equal(normalized[1].person, "Nick");
    assert.equal(normalized[2].person, "Nick");
  });
});

describe("activeEmployeeEntries", () => {
  it("drops former staff and keeps active people including email aliases", () => {
    const entries = [
      { id: 1, person: "Natasha", date: "2026-11-01" },
      { id: 2, person: "natasha@longhouse.co", date: "2026-11-01" },
      { id: 3, person: "Nick", date: "2026-11-01" },
      { id: 4, person: "Deleted User", date: "2026-11-01" },
      { id: 5, person: "Jay", date: "2026-11-01" },
    ] as Array<{ id: number; person: string; date: string }>;

    const employees = [
      {
        id: 1,
        person: "Natasha",
        photo_url: null,
        active: true,
        start_date: null,
        end_date: null,
        notes: null,
        also_known_as: ["natasha@longhouse.co"],
      },
    ];

    const active = activeEmployeeEntries(entries as never, employees as never);
    assert.deepEqual(
      active.map((row) => row.person),
      ["Natasha", "Natasha"]
    );
  });
});
