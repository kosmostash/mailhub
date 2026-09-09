import type { ComponentProps } from "react";

import { cn } from "~/lib/utils";

export const Card = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    className={cn(
      "bg-card text-card-foreground rounded-xl border shadow-xs",
      className,
    )}
    {...props}
  />
);

export const CardHeader = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    className={cn(
      "flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3",
      className,
    )}
    {...props}
  />
);

export const CardTitle = ({ className, ...props }: ComponentProps<"h3">) => (
  <h3 className={cn("text-sm leading-none font-semibold", className)} {...props} />
);

export const CardDescription = ({ className, ...props }: ComponentProps<"p">) => (
  <p className={cn("text-muted-foreground text-sm", className)} {...props} />
);

export const CardContent = ({ className, ...props }: ComponentProps<"div">) => (
  <div className={cn("p-4", className)} {...props} />
);

export const CardFooter = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    className={cn("flex items-center gap-2 border-t px-4 py-3", className)}
    {...props}
  />
);
