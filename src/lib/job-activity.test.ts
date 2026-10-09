import { describe, expect, test, vi } from "vitest";

import {
  hasUnsavedResult,
  isJobRunning,
  jobFinished,
  jobStarted,
  resultCleared,
  resultShown,
  subscribeJobActivity,
} from "@/lib/job-activity";

// The store is module state: every test leaves it idle again.
describe("job activity", () => {
  test("a started job counts as running until it finishes", () => {
    expect(isJobRunning()).toBe(false);
    jobStarted();
    expect(isJobRunning()).toBe(true);
    jobFinished();
    expect(isJobRunning()).toBe(false);
  });

  test("overlapping jobs run until the last one finishes", () => {
    jobStarted();
    jobStarted();
    jobFinished();
    expect(isJobRunning()).toBe(true);
    jobFinished();
    expect(isJobRunning()).toBe(false);
  });

  test("an extra finish never makes a later job look idle", () => {
    jobFinished();
    jobStarted();
    expect(isJobRunning()).toBe(true);
    jobFinished();
    expect(isJobRunning()).toBe(false);
  });

  test("subscribers hear every change until they unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeJobActivity(listener);
    jobStarted();
    jobFinished();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    jobStarted();
    jobFinished();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test("a shown download counts as unsaved until it is cleared, and subscribers hear it", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeJobActivity(listener);
    expect(hasUnsavedResult()).toBe(false);
    resultShown();
    expect(hasUnsavedResult()).toBe(true);
    resultCleared();
    resultCleared(); // an extra clear never goes below zero
    expect(hasUnsavedResult()).toBe(false);
    resultShown();
    expect(hasUnsavedResult()).toBe(true);
    resultCleared();
    expect(listener).toHaveBeenCalledTimes(5);
    unsubscribe();
  });
});
