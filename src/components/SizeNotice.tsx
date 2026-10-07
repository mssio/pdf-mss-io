import { ErrorBox } from "@/components/ErrorBox";
import type { SizeCheck } from "@/lib/limits";

export function SizeNotice({ check }: { check: SizeCheck }) {
  if (check.ok) return null;
  return <ErrorBox error={{ message: check.message }} />;
}
