import type { ComponentProps } from "react";

import { cn } from "~/lib/utils";

export const Input = ({ className, type, ...props }: ComponentProps<"input">) => (
  <input
    type={type}
    className={cn(
      "border-input bg-card flex h-9 w-full min-w-0 rounded-md border px-3 py-1 text-sm shadow-xs transition-colors",
      "placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
      "file:text-foreground file:border-0 file:bg-transparent file:text-sm file:font-medium",
      className,
    )}
    {...props}
  />
);

export const Textarea = ({ className, ...props }: ComponentProps<"textarea">) => (
  <textarea
    className={cn(
      "border-input bg-card flex min-h-16 w-full rounded-md border px-3 py-2 text-sm shadow-xs transition-colors",
      "placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
);
