import type { ComponentProps } from "react";
import { Label as LabelPrimitive } from "radix-ui";

import { cn } from "~/lib/utils";

export const Label = ({
  className,
  ...props
}: ComponentProps<typeof LabelPrimitive.Root>) => (
  <LabelPrimitive.Root
    className={cn(
      "text-foreground flex items-center gap-2 text-sm leading-none font-medium select-none",
      "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
      className,
    )}
    {...props}
  />
);
