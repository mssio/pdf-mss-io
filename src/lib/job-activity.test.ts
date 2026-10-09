import { describe, expect, test, vi } from "vitest";

import { isJobRunning, jobFinished, jobStarted, subscribeJobActivity } from "@/lib/job-activity";

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
});
