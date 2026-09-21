import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aliasesToRemember,
  formatAliasInput,
  parseAliasInput,
  resolveEmployeeName,
} from "./resolvePerson.ts";

const directory = [
  { person: "Hai" },
  { person: "Hailey" },
  { person: "Jay" },
  { person: "Jayden" },
  { person: "Harry" },
  { person: "James" },
  { person: "Renz" },
  { person: "Simran Rai" },
  { person: "Benton" },
];

describe("resolveEmployeeName", () => {
  it("keeps exact preferred names", () => {
    assert.equal(resolveEmployeeName("Renz", directory), "Renz");
    assert.equal(resolveEmployeeName("hailey", directory), "Hailey");
  });

  it("maps Hub / Memtime full names and emails onto first-name directory rows", () => {
    assert.equal(resolveEmployeeName("Harry Smith", directory), "Harry");
    assert.equal(resolveEmployeeName("Benton Sorensen", directory), "Benton");
    assert.equal(
      resolveEmployeeName("james@longhouse.co", directory),
      "James"
    );
  });

  it("maps Renzrick and renzrick@ onto Renz via unique prefix", () => {
    assert.equal(resolveEmployeeName("Renzrick", directory), "Renz");
    assert.equal(
      resolveEmployeeName("renzrick@longhouse.co", directory),
      "Renz"
    );
  });

  it("uses aliases when preferred name changed", () => {
    const renamed = [
      ...directory.filter((p) => p.person !== "Renz"),
      { person: "Renzrick", alsoKnownAs: ["Renz", "renzrick@longhouse.co"] },
    ];
    assert.equal(resolveEmployeeName("Renz", renamed), "Renzrick");
    assert.equal(
      resolveEmployeeName("renzrick@longhouse.co", renamed),
      "Renzrick"
    );
    assert.equal(resolveEmployeeName("Renzrick", renamed), "Renzrick");
  });

  it("does not let Hai and Hailey steal each other's rows", () => {
    assert.equal(resolveEmployeeName("Hai", directory), "Hai");
    assert.equal(resolveEmployeeName("Hailey", directory), "Hailey");
    assert.equal(
      resolveEmployeeName("Hailey Veenendaal", directory),
      "Hailey"
    );
    assert.equal(resolveEmployeeName("hai@longhouse.co", directory), "Hai");
    assert.equal(
      resolveEmployeeName("hailey@longhouse.co", directory),
      "Hailey"
    );
  });

  it("does not let Jay and Jayden steal each other's rows", () => {
    assert.equal(resolveEmployeeName("Jay", directory), "Jay");
    assert.equal(resolveEmployeeName("Jayden", directory), "Jayden");
    assert.equal(resolveEmployeeName("Jayden L", directory), "Jayden");
  });

  it("maps Simran onto Simran Rai", () => {
    assert.equal(resolveEmployeeName("Simran", directory), "Simran Rai");
    assert.equal(resolveEmployeeName("simran@longhouse.co", directory), "Simran Rai");
  });

  it("leaves unknown and ambiguous values unchanged", () => {
    assert.equal(resolveEmployeeName("Deleted User", directory), "Deleted User");
    assert.equal(resolveEmployeeName("keenan@longhouse.co", directory), "keenan@longhouse.co");
    const twoRenz = [{ person: "Renz" }, { person: "Renzr" }];
    assert.equal(resolveEmployeeName("Renzrick", twoRenz), "Renzrick");
  });

  it("returns the CSV user when the directory is empty", () => {
    assert.equal(resolveEmployeeName("Renz", []), "Renz");
  });
});

describe("alias helpers", () => {
  it("parses and formats comma/newline lists without duplicates", () => {
    assert.deepEqual(parseAliasInput("Renzrick, renzrick@longhouse.co\nRenz"), [
      "Renzrick",
      "renzrick@longhouse.co",
      "Renz",
    ]);
    assert.deepEqual(parseAliasInput("Renz, renz, RENZ"), ["Renz"]);
    assert.equal(
      formatAliasInput(["Renzrick", "renzrick@longhouse.co"]),
      "Renzrick, renzrick@longhouse.co"
    );
  });

  it("remembers Memtime user strings that differ from the preferred name", () => {
    assert.deepEqual(aliasesToRemember("Renzrick", "Renz"), ["Renzrick"]);
    assert.deepEqual(aliasesToRemember("Renz", "Renz"), []);
    assert.deepEqual(aliasesToRemember(" renz ", "Renz"), []);
  });
});
