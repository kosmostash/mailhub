import { type VariantProps, cva } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "~/lib/utils";

const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-y-1 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(--spacing(4))_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground",
        info: "border-primary/25 bg-primary/8 text-foreground [&>svg]:text-primary",
        destructive:
          "border-destructive/25 bg-destructive/8 text-foreground [&>svg]:text-destructive",
        success: "border-sent/25 bg-sent-soft text-foreground [&>svg]:text-sent",
        warning: "border-pending/25 bg-pending-soft text-foreground [&>svg]:text-pending",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export const Alert = ({
  className,
  variant,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof alertVariants>) => (
  <div role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
);

export const AlertTitle = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    className={cn("col-start-2 min-h-4 font-medium tracking-tight", className)}
    {...props}
  />
);

export const AlertDescription = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    className={cn("text-muted-foreground col-start-2 text-sm [&_p]:leading-relaxed", className)}
    {...props}
  />
);
