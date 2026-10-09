import { Link } from "react-router";

import { offlineLabel } from "@/lib/offline-status";
import { useOfflineStatus } from "@/lib/use-offline-status";

/** Footer entry: whether the app works offline here; opens /offline for details. */
export function OfflineStatusLink() {
  const snapshot = useOfflineStatus();
  if (!snapshot) return null;
  return (
    <>
      {" · "}
      <Link to="/offline" className="underline-offset-4 hover:underline">
        {offlineLabel(snapshot.state)}
      </Link>
    </>
  );
}
