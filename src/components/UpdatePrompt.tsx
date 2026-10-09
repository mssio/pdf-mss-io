import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/** Offers a downloaded new version. Later (or Esc) puts it off; the footer button stays available. */
export function UpdateDialog({ open, onLater, onUpdate }: { open: boolean; onLater: () => void; onUpdate: () => void }) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onLater();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Update available</AlertDialogTitle>
          <AlertDialogDescription>
            A new version of PDF Toolbox is ready. Updating reloads the page, so anything you've chosen here will need
            to be chosen again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Later</AlertDialogCancel>
          <AlertDialogAction onClick={onUpdate}>Update now</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Footer entry after the version once an update is ready; disabled while a job runs. */
export function UpdateFooterButton({ disabled, onUpdate }: { disabled: boolean; onUpdate: () => void }) {
  return (
    <>
      {" · "}
      <Button variant="link" size="sm" className="h-auto p-0 text-xs" disabled={disabled} onClick={onUpdate}>
        Update to the latest version
      </Button>
    </>
  );
}
