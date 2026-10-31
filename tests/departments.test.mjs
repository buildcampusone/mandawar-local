import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DEPARTMENTS, slugify, cleanName, nameProblem, sortDepartments, activeDepartments,
  nextOrder, moveDepartment, missingDefaults, deptEmoji, STORE_ID
} from "../shared/config/departments.js";

const D = (id, order, extra = {}) => ({ id, name: id.toUpperCase(), order, active: true, ...extra });

test("17 default grocery departments, unique ids, ids are clean slugs, every one has a tile icon", () => {
  assert.equal(DEFAULT_DEPARTMENTS.length, 17);
  assert.equal(new Set(DEFAULT_DEPARTMENTS.map((d) => d.id)).size, 17);
  for (const d of DEFAULT_DEPARTMENTS) {
    assert.equal(slugify(d.name), d.id, d.name);
    assert.ok(d.name.length >= 2 && d.name.length <= 30, d.name);
    assert.notEqual(deptEmoji(d.id), "🛒", d.id + " has no emoji");
  }
  assert.equal(deptEmoji("owner-added"), "🛒");
  assert.equal(STORE_ID, "main");
});

test("slugify and cleanName", () => {
  assert.equal(slugify("  Dairy, Bread & Eggs "), "dairy-bread-eggs");
  assert.equal(slugify("!!!"), "");
  assert.equal(cleanName("  Dal   &  Pulses "), "Dal & Pulses");
  assert.equal(cleanName(7), "");
});

test("nameProblem: length 2-30 and no duplicate (own name allowed when renaming)", () => {
  const have = [D("a", 1, { name: "Atta & Flour" })];
  assert.match(nameProblem("x", have), /2 se 30/);
  assert.match(nameProblem("x".repeat(31), have), /2 se 30/);
  assert.match(nameProblem("  atta   & FLOUR ", have), /pehle se/);
  assert.equal(nameProblem("atta & flour", have, "a"), "");
  assert.equal(nameProblem("Rice & Grains", have), "");
});

test("sortDepartments: by order, then name; missing order last; input untouched", () => {
  const input = [D("c", 3), D("noord", undefined), D("a", 1), D("b", 1, { name: "Aaa" })];   // same order -> name decides
  const out = sortDepartments(input);
  assert.deepEqual(out.map((d) => d.id), ["a", "b", "c", "noord"]);
  assert.deepEqual(input.map((d) => d.id), ["c", "noord", "a", "b"]);
});

test("activeDepartments hides inactive ones", () => {
  assert.deepEqual(activeDepartments([D("a", 2), D("b", 1, { active: false }), D("c", 1)]).map((d) => d.id), ["c", "a"]);
});

test("nextOrder", () => {
  assert.equal(nextOrder([]), 1);
  assert.equal(nextOrder([D("a", 4), D("b", 9)]), 10);
});

test("moveDepartment swaps neighbours, renumbers the shelf, and is empty at the ends", () => {
  const l = [D("a", 1), D("b", 2), D("c", 3)];
  assert.deepEqual(moveDepartment(l, "b", -1), [{ id: "b", order: 1 }, { id: "a", order: 2 }]);
  assert.deepEqual(moveDepartment(l, "b", 1), [{ id: "c", order: 2 }, { id: "b", order: 3 }]);
  assert.deepEqual(moveDepartment(l, "a", -1), []);
  assert.deepEqual(moveDepartment(l, "c", 1), []);
  assert.deepEqual(moveDepartment(l, "zzz", 1), []);
});

test("moveDepartment heals duplicate order numbers", () => {
  const w = moveDepartment([D("a", 5), D("b", 5), D("c", 5)], "c", -1);
  const final = new Map([["a", 5], ["b", 5], ["c", 5]]);
  w.forEach((x) => final.set(x.id, x.order));
  assert.equal(new Set(final.values()).size, 3, "all three get different numbers");
});

test("missingDefaults: all 17 on an empty shelf, only the gaps otherwise, appended after existing orders", () => {
  const all = missingDefaults([]);
  assert.equal(all.length, 17);
  assert.deepEqual(all.map((d) => d.order), Array.from({ length: 17 }, (_, i) => i + 1));
  const some = missingDefaults([{ id: "beverages", name: "Beverages", order: 7, active: false }]);
  assert.equal(some.length, 16);
  assert.ok(!some.some((d) => d.id === "beverages"));
  assert.equal(some[0].order, 8);
  assert.deepEqual(missingDefaults(DEFAULT_DEPARTMENTS.map((d, i) => ({ ...d, order: i + 1 }))), []);
});
