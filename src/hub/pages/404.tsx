import Link from "~/components/Link";

/**
 * The catch-all for unmatched URLs (§5.x). It is a sibling of the real routes,
 * so the app shell wraps it but no layout does.
 */
export default function NotFound() {
  return (
    <div className="empty">
      <h1>Nothing here</h1>
      <p>That URL doesn't match anything in MailHub.</p>
      <p style={{ marginTop: "1rem" }}>
        <Link to={["index"]}>Back to the dashboard</Link>
      </p>
    </div>
  );
}
