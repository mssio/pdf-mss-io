/**
 * The footer note for a test build (`npm run build:test`): the commit it was built from, "-dirty" when
 * there were uncommitted changes, and the local build time, e.g. "test e68a395 10-09 14:32".
 */
export function testBuildLabel({ commit, dirty, builtAt }: { commit: string; dirty: boolean; builtAt: Date }): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const when = `${pad(builtAt.getMonth() + 1)}-${pad(builtAt.getDate())} ${pad(builtAt.getHours())}:${pad(builtAt.getMinutes())}`;
  return `test ${commit}${dirty ? "-dirty" : ""} ${when}`;
}
