import { expect, test, vi } from "vitest";

const { createQpdf } = vi.hoisted(() => ({ createQpdf: vi.fn() }));
vi.mock("@mssio/qpdf-wasm", () => ({ createQpdf }));

import { getQpdf, resetQpdf } from "@/lib/qpdf";

test("getQpdf caches the instance and retries after a failed load", async () => {
  const instance = { terminate: vi.fn() };
  createQpdf.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(instance);

  await expect(getQpdf()).rejects.toThrow("offline");
  await expect(getQpdf()).resolves.toBe(instance);
  await expect(getQpdf()).resolves.toBe(instance);
  expect(createQpdf).toHaveBeenCalledTimes(2);
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 20)); // lets the dynamic import finish

test("resetQpdf drops a stuck engine without waiting for it, and the next call starts a fresh one", async () => {
  resetQpdf(); // forget the engine cached by the previous test
  const fresh = { terminate: vi.fn() };
  createQpdf.mockReturnValueOnce(new Promise(() => {})); // an engine that never finishes loading
  createQpdf.mockResolvedValueOnce(fresh);

  void getQpdf();
  await settle();
  const callsBefore = createQpdf.mock.calls.length;
  resetQpdf(); // must not wait for the stuck engine
  await expect(getQpdf()).resolves.toBe(fresh);
  expect(createQpdf.mock.calls.length).toBe(callsBefore + 1);
});

test("resetQpdf terminates an engine that did load", async () => {
  resetQpdf();
  const loaded = { terminate: vi.fn() };
  createQpdf.mockResolvedValueOnce(loaded);
  await expect(getQpdf()).resolves.toBe(loaded);
  resetQpdf();
  await vi.waitFor(() => expect(loaded.terminate).toHaveBeenCalledTimes(1));
});

test("a late load failure of a dropped engine doesn't forget the fresh one", async () => {
  resetQpdf();
  let failOld: (error: Error) => void = () => {};
  createQpdf.mockReturnValueOnce(new Promise((_, reject) => (failOld = reject)));
  const fresh = { terminate: vi.fn() };
  createQpdf.mockResolvedValueOnce(fresh);

  const old = getQpdf();
  old.catch(() => {});
  await settle();
  resetQpdf(); // drop the stuck engine
  await expect(getQpdf()).resolves.toBe(fresh);
  failOld(new Error("worker failed to load")); // the dropped engine finally fails
  await settle();
  const callsBefore = createQpdf.mock.calls.length;
  await expect(getQpdf()).resolves.toBe(fresh); // still cached, no third engine
  expect(createQpdf.mock.calls.length).toBe(callsBefore);
});
