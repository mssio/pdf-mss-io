import { describe, expect, test } from "vitest";

import { clearCrashedJob, hadCrashedJob, markJobFinished, markJobStarted } from "@/lib/crash-guard";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  };
}

describe("crash guard", () => {
  test("a job that finishes leaves no crash behind", () => {
    const storage = memoryStorage();
    markJobStarted(storage);
    markJobFinished(storage);
    expect(hadCrashedJob(storage)).toBe(false);
  });

  test("a job that never finished (page reloaded mid-job) is reported once", () => {
    const storage = memoryStorage();
    markJobStarted(storage);
    expect(hadCrashedJob(storage)).toBe(true);
    clearCrashedJob(storage);
    expect(hadCrashedJob(storage)).toBe(false);
  });

  test("storage errors (private mode, disabled storage) are ignored", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    } as unknown as Storage;
    expect(() => markJobStarted(broken)).not.toThrow();
    expect(() => markJobFinished(broken)).not.toThrow();
    expect(hadCrashedJob(broken)).toBe(false);
    expect(() => clearCrashedJob(broken)).not.toThrow();
  });

  test("no storage at all (tests, old browsers) is ignored", () => {
    expect(hadCrashedJob(undefined)).toBe(false);
    expect(() => markJobStarted(undefined)).not.toThrow();
  });
});
