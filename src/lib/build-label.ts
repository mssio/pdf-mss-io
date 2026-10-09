/**
 * The footer note for a test build (`npm run build:test`): the commit it was built from, "-dirty" when
 * there were uncommitted changes, and the local build time, e.g. "test e68a395 2026-10-09 14:32:00".
 */
export function testBuildLabel({ commit, dirty, builtAt }: { commit: string; dirty: boolean; builtAt: Date }): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${builtAt.getFullYear()}-${pad(builtAt.getMonth() + 1)}-${pad(builtAt.getDate())}`;
  const time = `${pad(builtAt.getHours())}:${pad(builtAt.getMinutes())}:${pad(builtAt.getSeconds())}`;
  const when = `${date} ${time}`;
  return `test ${commit}${dirty ? "-dirty" : ""} ${when}`;
}
