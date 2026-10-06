import { describe, expect, test } from "vitest";

import { mergeListReducer, toMergeItems, type MergeItem } from "@/lib/merge-list";

const file = (name: string) => new File(["x"], name, { type: "application/pdf" });
let counter = 0;
const nextId = () => `id-${++counter}`;
const names = (items: MergeItem[]) => items.map((item) => item.file.name);

describe("mergeListReducer", () => {
  const a = file("a.pdf");
  const b = file("b.pdf");
  const c = file("c.pdf");
  const start = toMergeItems([a, b, c], nextId);

  test("add appends in order", () => {
    const d = toMergeItems([file("d.pdf")], nextId);
    expect(names(mergeListReducer(start, { type: "add", items: d }))).toEqual(["a.pdf", "b.pdf", "c.pdf", "d.pdf"]);
  });

  test("the same file added twice gets two distinct entries", () => {
    const twice = mergeListReducer([], { type: "add", items: toMergeItems([a, a], nextId) });
    expect(twice).toHaveLength(2);
    expect(twice[0].id).not.toBe(twice[1].id);
    const removedOne = mergeListReducer(twice, { type: "remove", id: twice[0].id });
    expect(removedOne).toEqual([twice[1]]);
  });

  test("move up and down", () => {
    expect(names(mergeListReducer(start, { type: "move", id: start[2].id, offset: -1 }))).toEqual([
      "a.pdf",
      "c.pdf",
      "b.pdf",
    ]);
    expect(names(mergeListReducer(start, { type: "move", id: start[0].id, offset: 1 }))).toEqual([
      "b.pdf",
      "a.pdf",
      "c.pdf",
    ]);
  });

  test("moving past either end changes nothing", () => {
    expect(mergeListReducer(start, { type: "move", id: start[0].id, offset: -1 })).toBe(start);
    expect(mergeListReducer(start, { type: "move", id: start[2].id, offset: 1 })).toBe(start);
  });

  test("remove, unknown ids and clear", () => {
    expect(names(mergeListReducer(start, { type: "remove", id: start[1].id }))).toEqual(["a.pdf", "c.pdf"]);
    expect(mergeListReducer(start, { type: "remove", id: "missing" })).toEqual(start);
    expect(mergeListReducer(start, { type: "move", id: "missing", offset: 1 })).toBe(start);
    expect(mergeListReducer(start, { type: "clear" })).toEqual([]);
  });

  test("remove then add the same file again puts it at the end", () => {
    const removed = mergeListReducer(start, { type: "remove", id: start[0].id });
    const readded = mergeListReducer(removed, { type: "add", items: toMergeItems([a], nextId) });
    expect(names(readded)).toEqual(["b.pdf", "c.pdf", "a.pdf"]);
  });
});
