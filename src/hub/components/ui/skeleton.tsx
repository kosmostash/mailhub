import type { ComponentProps } from "react";

import { cn } from "~/lib/utils";

/**
 * A shaped placeholder. Better than a spinner for a page whose layout is known
 * before its data is: the page does not jump when the data lands.
 */
export const Skeleton = ({ className, ...props }: ComponentProps<"div">) => (
  <div className={cn("bg-muted animate-pulse rounded-md", className)} {...props} />
);
