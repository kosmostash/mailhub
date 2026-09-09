import type { ComponentProps } from "react";

import { cn } from "~/lib/utils";

/**
 * A plain table, styled. The review queue is a table and should behave like
 * one - sortable columns and virtual rows would be a different component, and
 * this app does not need one yet.
 */
export const Table = ({ className, ...props }: ComponentProps<"table">) => (
  <div className="w-full overflow-x-auto">
    <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
  </div>
);

export const TableHeader = ({ className, ...props }: ComponentProps<"thead">) => (
  <thead className={cn("[&_tr]:border-b", className)} {...props} />
);

export const TableBody = ({ className, ...props }: ComponentProps<"tbody">) => (
  <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />
);

export const TableRow = ({ className, ...props }: ComponentProps<"tr">) => (
  <tr
    className={cn(
      "hover:bg-muted/50 data-[state=selected]:bg-accent border-b transition-colors",
      className,
    )}
    {...props}
  />
);

export const TableHead = ({ className, ...props }: ComponentProps<"th">) => (
  <th
    className={cn(
      "text-muted-foreground h-9 px-3 text-left align-middle text-[0.6875rem] font-semibold tracking-wide whitespace-nowrap uppercase",
      className,
    )}
    {...props}
  />
);

export const TableCell = ({ className, ...props }: ComponentProps<"td">) => (
  <td className={cn("px-3 py-2.5 align-middle", className)} {...props} />
);
