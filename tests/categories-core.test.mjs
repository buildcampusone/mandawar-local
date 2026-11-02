import test from "node:test";
import assert from "node:assert/strict";
import { groupDepartments, TABS } from "../modules/customer/categories-core.js";
import { DEFAULT_DEPARTMENTS } from "../shared/config/departments.js";

test("every default department lands in exactly one group, in shelf order", () => {
  const g = groupDepartments(DEFAULT_DEPARTMENTS);
  assert.deepEqual(g.map((x) => x.key), ["grocery", "snacks", "fresh", "home"]);
  assert.equal(g.reduce((n, x) => n + x.items.length, 0), DEFAULT_DEPARTMENTS.length);
  assert.equal(g[0].items[0].id, "atta-flour");
});
test("owner-added departments go to More with a letter icon", () => {
  const g = groupDepartments([{ id: "pooja", name: "Pooja Samagri" }]);
  assert.equal(g[0].key, "more");
  assert.equal(g[0].items[0].icon, "P");
});
test("search filters by name, ignores case, drops empty groups; bad input is safe", () => {
  const g = groupDepartments(DEFAULT_DEPARTMENTS, " RICE ");
  assert.deepEqual(g.map((x) => x.items.map((i) => i.id)), [["rice-grains"]]);
  assert.deepEqual(groupDepartments(null), []);
  assert.deepEqual(groupDepartments([{ id: 1 }, null]), []);
});
test("tabs: Categories is the current page, the others point somewhere", () => {
  assert.equal(TABS.filter((t) => !t.to).length, 1);
  assert.equal(TABS.find((t) => !t.to).id, "categories");
});
