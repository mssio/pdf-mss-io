import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { clearCrashedJob, guardDownload, hadCrashedJob, markJobFinished, markJobStarted } from "@/lib/crash-guard";

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

describe("guardDownload", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("arms the crash note while the download is built and for 2 s after", () => {
    const storage = memoryStorage();
    let armedDuringBuild = false;
    const url = guardDownload(
      () => {
        armedDuringBuild = hadCrashedJob(storage);
        return "blob:x";
      },
      { storage },
    );
    expect(url).toBe("blob:x");
    expect(armedDuringBuild).toBe(true);
    expect(hadCrashedJob(storage)).toBe(true);
    vi.advanceTimersByTime(1999);
    expect(hadCrashedJob(storage)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(hadCrashedJob(storage)).toBe(false);
  });

  test("a build that throws still clears the note", () => {
    const storage = memoryStorage();
    expect(() =>
      guardDownload(
        () => {
          throw new RangeError("out of memory");
        },
        { storage },
      ),
    ).toThrow(RangeError);
    vi.advanceTimersByTime(2000);
    expect(hadCrashedJob(storage)).toBe(false);
  });
});
