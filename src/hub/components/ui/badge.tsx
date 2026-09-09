import { type VariantProps, cva } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "~/lib/utils";

/**
 * The lifecycle and delivery colours are variants here rather than ad-hoc
 * classes at each call site, so `pending` looks the same in a table, on a card
 * and in the email view.
 */
export const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold tracking-wide uppercase",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        neutral: "border-border bg-muted text-muted-foreground",
        outline: "text-foreground",
        pending: "border-pending/25 bg-pending-soft text-pending",
        ready: "border-ready/25 bg-ready-soft text-ready",
        sent: "border-sent/25 bg-sent-soft text-sent",
        delivered: "border-sent/25 bg-sent-soft text-sent",
        bounced: "border-bounced/25 bg-bounced-soft text-bounced",
        unknown: "border-border bg-muted text-muted-foreground",
        destructive: "border-destructive/25 bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export const Badge = ({
  className,
  variant,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) => (
  <span className={cn(badgeVariants({ variant }), className)} {...props} />
);
