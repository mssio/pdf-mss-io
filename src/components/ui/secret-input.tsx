import * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A password field that browsers and password managers don't offer to save: a masked text input
 * (browsers ignore autocomplete="off" on type="password") plus the managers' opt-out attributes.
 */
function SecretInput({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <Input
      {...props}
      type="text"
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      data-1p-ignore="true"
      data-lpignore="true"
      data-bwignore="true"
      data-form-type="other"
      className={cn("[-webkit-text-security:disc]", className)}
    />
  );
}

export { SecretInput };
