import type { FormEvent, ReactNode } from "react";

/**
 * The small vocabulary the pages are built from.
 *
 * Nothing here knows about MailHub's domain beyond the badge palette: these
 * are the pieces that would otherwise be re-typed on every page, and keeping
 * them in one file is what lets a page read as its own logic rather than as
 * markup.
 */

export const Badge = ({
  kind,
  children,
}: {
  kind: string;
  children: ReactNode;
}) => <span className={`badge ${kind}`}>{children}</span>;

/** The lifecycle state (§2.7), always shown with the same colour. */
export const StateBadge = ({ state }: { state: string }) => (
  <Badge kind={state}>{state}</Badge>
);

/** The provider-reported outcome, orthogonal to the state (§2.7). */
export const DeliveryBadge = ({ status }: { status: string }) =>
  status === "unknown" ? (
    <span className="faint">–</span>
  ) : (
    <Badge kind={status}>{status}</Badge>
  );

export const Notice = ({
  kind = "info",
  children,
}: {
  kind?: "info" | "error" | "ok";
  children: ReactNode;
}) => (
  <div className={`notice ${kind}`} role={kind === "error" ? "alert" : undefined}>
    {children}
  </div>
);

/**
 * Errors from the fetch client. It throws on every failure, and the body of a
 * MailHub failure is always `{ error, code }` - so one reader covers a
 * validation error caught in the browser, an HTTP status, and a dead network.
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

export const ErrorNotice = ({ error }: { error: unknown }) =>
  error ? <Notice kind="error">{errorMessage(error)}</Notice> : null;

export const Empty = ({ title, children }: { title: string; children?: ReactNode }) => (
  <div className="empty">
    <strong>{title}</strong>
    {children ? <p>{children}</p> : null}
  </div>
);

export const Splash = ({ label = "Loading…" }: { label?: string }) => (
  <div className="splash">{label}</div>
);

export const Field = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <label className="field">
    {label}
    {children}
  </label>
);

/** A form that never reloads the page - every submit goes through fetch. */
export const Form = ({
  onSubmit,
  children,
  className,
}: {
  onSubmit: () => void;
  children: ReactNode;
  className?: string;
}) => (
  <form
    className={className}
    onSubmit={(event: FormEvent) => {
      event.preventDefault();
      onSubmit();
    }}
  >
    {children}
  </form>
);

export const Panel = ({
  title,
  actions,
  children,
}: {
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) => (
  <section className="panel">
    <header>
      <h2>{title}</h2>
      {actions ? <div className="row">{actions}</div> : null}
    </header>
    {children}
  </section>
);

/** A copyable value - used for the collection id, which is its API key (§5.3). */
export const CopyableKey = ({ value }: { value: string }) => (
  <div className="apikey">
    <span>{value}</span>
    <button
      type="button"
      className="quiet small"
      onClick={() => void navigator.clipboard?.writeText(value)}
      title="Copy to clipboard"
    >
      copy
    </button>
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

/** Absolute on hover, relative at a glance - a review queue is read quickly. */
export const When = ({ at }: { at: string | null }) => {
  if (!at) return <span className="faint">–</span>;

  const elapsed = Date.now() - new Date(at).getTime();
  const unit = UNITS.find(([, ms]) => Math.abs(elapsed) >= ms);
  const label = unit
    ? RELATIVE.format(-Math.round(elapsed / unit[1]), unit[0])
    : "just now";

  return (
    <time dateTime={at} title={new Date(at).toLocaleString()}>
      {label}
    </time>
  );
};

/** Recipients, collapsed - lists get long and the first one is what matters. */
export const Addresses = ({
  list,
}: {
  list: Array<{ address: string; name?: string }>;
}) => {
  if (!list.length) return <span className="faint">–</span>;
  const [first, ...rest] = list;
  return (
    <span title={list.map((entry) => entry.address).join(", ")}>
      {first!.name ? `${first!.name} <${first!.address}>` : first!.address}
      {rest.length ? <span className="faint"> +{rest.length}</span> : null}
    </span>
  );
};
