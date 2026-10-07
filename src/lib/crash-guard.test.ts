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

  test("a note left by a page load that was killed mid-job is reported once", () => {
    const storage = memoryStorage();
    storage.setItem("pdf-mss-io-job-running", "1"); // written by the page that was killed
    expect(hadCrashedJob(storage)).toBe(true);
    clearCrashedJob(storage);
    expect(hadCrashedJob(storage)).toBe(false);
  });

  test("start-up clearing leaves the note of a job running in this page alone", () => {
    const storage = memoryStorage();
    markJobStarted(storage);
    clearCrashedJob(storage);
    expect(hadCrashedJob(storage)).toBe(true);
    markJobFinished(storage);
    expect(hadCrashedJob(storage)).toBe(false);
  });

  test("an earlier job finishing doesn't clear the note of a job still running", () => {
    const storage = memoryStorage();
    markJobStarted(storage); // job A
    markJobStarted(storage); // job B
    markJobFinished(storage); // A finishes (e.g. abandoned after reset)
    expect(hadCrashedJob(storage)).toBe(true);
    markJobFinished(storage); // B finishes
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
