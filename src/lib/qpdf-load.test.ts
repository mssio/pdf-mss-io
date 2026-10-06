import { expect, test, vi } from "vitest";

const { createQpdf } = vi.hoisted(() => ({ createQpdf: vi.fn() }));
vi.mock("@mssio/qpdf-wasm", () => ({ createQpdf }));

import { getQpdf } from "@/lib/qpdf";

test("getQpdf caches the instance and retries after a failed load", async () => {
  const instance = { terminate: vi.fn() };
  createQpdf.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(instance);

  await expect(getQpdf()).rejects.toThrow("offline");
  await expect(getQpdf()).resolves.toBe(instance);
  await expect(getQpdf()).resolves.toBe(instance);
  expect(createQpdf).toHaveBeenCalledTimes(2);
});
