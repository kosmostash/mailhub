import { Button } from "~/components/ui/button";
import Link from "~/components/Link";

/**
 * The catch-all for unmatched URLs. It is a sibling of the real routes, so the
 * app shell wraps it but no layout does.
 */
export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-center">
      <p className="text-muted-foreground font-mono text-sm">404</p>
      <h1 className="text-xl font-semibold tracking-tight">Nothing here</h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        That URL doesn't match anything in MailHub.
      </p>
      <Button asChild variant="outline" className="mt-2">
        <Link to={["index"]}>Back to collections</Link>
      </Button>
    </div>
  );
}
