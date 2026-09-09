import { CopyIcon, CheckIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";

/**
 * The pieces that know what MailHub is about.
 *
 * `components/ui/` is a general-purpose kit that could belong to any app; this
 * is the layer above it that knows an email has a lifecycle state and that a
 * collection id is a credential.
 */

/** The lifecycle state (§2.7), always the same colour wherever it appears. */
export const StateBadge = ({ state }: { state: string }) => (
  <Badge variant={state as "pending"}>{state}</Badge>
);

/** What the provider reported - orthogonal to the state (§2.7). */
export const DeliveryBadge = ({ status }: { status: string }) =>
  status === "unknown" ? (
    <span className="text-muted-foreground text-xs">—</span>
  ) : (
    <Badge variant={status as "delivered"}>{status}</Badge>
  );

/**
 * Errors from the fetch client, which throws on every failure. A MailHub
 * failure carries `{ error, code }`, so one reader covers a validation error
 * caught in the browser, an HTTP status and a dead network alike.
 */
export const errorMessage = (error: unknown): string => {
  if (!error) return "";
  const body = (error as { body?: { error?: string } })?.body;
  if (body?.error) return body.error;
  const nested = (error as { response?: { error?: string } })?.response;
  if (nested?.error) return nested.error;
  if (error instanceof Error) return error.message;
  return String(error);
};

export const Empty = ({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) => (
  <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
    <p className="font-medium">{title}</p>
    {children ? (
      <p className="text-muted-foreground max-w-md text-sm">{children}</p>
    ) : null}
    {action ? <div className="mt-2">{action}</div> : null}
  </div>
);

/** A page-shaped placeholder while the first request is in flight. */
export const PageSkeleton = () => (
  <div className="space-y-4">
    <Skeleton className="h-8 w-56" />
    <Skeleton className="h-4 w-96" />
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Skeleton className="h-44" />
      <Skeleton className="h-44" />
      <Skeleton className="h-44" />
    </div>
  </div>
);

export const PageHeading = ({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) => (
  <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
    <div className="space-y-1">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {description ? (
        <p className="text-muted-foreground max-w-2xl text-sm">{description}</p>
      ) : null}
    </div>
    {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
  </div>
);

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 31_536_000_000],
  ["month", 2_592_000_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** Relative at a glance, absolute on hover - a review queue is read quickly. */
export const When = ({ at }: { at: string | null }) => {
  if (!at) return <span className="text-muted-foreground text-xs">—</span>;

  const elapsed = Date.now() - new Date(at).getTime();
  const unit = UNITS.find(([, ms]) => Math.abs(elapsed) >= ms);
  const label = unit
    ? RELATIVE.format(-Math.round(elapsed / unit[1]), unit[0])
    : "just now";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time dateTime={at} className="cursor-default">
          {label}
        </time>
      </TooltipTrigger>
      <TooltipContent>{new Date(at).toLocaleString()}</TooltipContent>
    </Tooltip>
  );
};

/** Recipients, collapsed: lists get long and the first one is what matters. */
export const Addresses = ({
  list,
}: {
  list: Array<{ address: string; name?: string }>;
}) => {
  if (!list.length) return <span className="text-muted-foreground text-xs">—</span>;
  const [first, ...rest] = list;

  const label = first!.name ? `${first!.name} <${first!.address}>` : first!.address;
  if (!rest.length) return <span className="truncate">{label}</span>;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-default truncate">
          {label} <span className="text-muted-foreground">+{rest.length}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{list.map((entry) => entry.address).join(", ")}</TooltipContent>
    </Tooltip>
  );
};

/**
 * A collection id, which is its API key (§2.3) - so it is shown as something
 * to copy rather than something to read.
 */
export const CopyableKey = ({ value }: { value: string }) => {
  const [copied, setCopied] = useState(false);

  return (
    <div className="bg-muted flex items-center gap-2 rounded-md border border-dashed px-3 py-2">
      <code className="flex-1 font-mono text-xs break-all">{value}</code>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          void navigator.clipboard?.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
};
