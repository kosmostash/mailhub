import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import fetchClients, { type ResponseT } from "_/fetch";

import { Empty, ErrorNotice, Splash, When } from "~/components/ui";
import { useSession } from "~/hooks/session";

type EntryT = ResponseT["activity"]["GET"]["entries"][number];

/**
 * The activity trail (§5.9) - newest first, read-only for everyone.
 *
 * The filters offered are the ones the caller is allowed to use: an admin can
 * narrow to one of their operators, the superadmin can also narrow by admin,
 * and an operator gets their own trail with nothing to narrow. The endpoint
 * enforces the same scoping, so the controls are a convenience rather than the
 * boundary.
 */

/** Human wording for the action verbs the domain records. */
const PHRASES: Record<string, string> = {
  "collection.create": "created collection",
  "collection.update": "updated collection",
  "collection.delete": "deleted collection",
  "email.approve": "approved",
  "email.send": "sent",
  "email.send_background": "sent in the background",
  "email.send_failed": "failed to send",
  "email.test_send": "sent a test copy of",
  "email.receive_smtp": "received over SMTP",
  "provider.create": "created provider",
  "provider.update": "updated provider",
  "provider.delete": "deleted provider",
  "operator.create": "created operator",
  "operator.disable": "disabled operator",
  "operator.enable": "re-enabled operator",
  "operator.reset_password": "reset the password of",
  "operator.reassign": "reassigned the objects of",
  "operator.delete": "deleted operator",
  "admin.create": "created admin",
  "admin.disable": "disabled admin",
  "admin.enable": "re-enabled admin",
  "admin.reset_password": "reset the password of",
  "admin.reassign": "reassigned the objects of",
  "admin.delete": "deleted admin",
  "account.sign_in": "signed in",
  "account.change_email": "changed their email",
  "account.change_password": "changed their password",
  "impersonation.start": "started impersonating",
  "impersonation.end": "stopped impersonating",
  "superadmin.bootstrap": "created the superadmin",
  "test_address.create": "added test address",
  "test_address.delete": "removed test address",
};

const Actor = ({ entry }: { entry: EntryT }) => {
  if (entry.actorKind === "sender") return <em>the background sender</em>;
  if (entry.actorKind === "smtp") return <em>the SMTP listener</em>;

  return (
    <>
      <strong>{entry.actorEmail}</strong>
      {entry.impersonatorEmail ? (
        // Impersonation is an audited convenience, not a disguise (§2.2).
        <span className="faint"> via impersonation by {entry.impersonatorEmail}</span>
      ) : null}
    </>
  );
};

export default function ActivityPage() {
  const session = useSession();
  const role = session.data?.actor?.identity.role;

  const [operatorId, setOperatorId] = useState("");
  const [adminId, setAdminId] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 100;

  const activity = useQuery({
    queryKey: ["activity", operatorId, adminId, offset],
    queryFn: () =>
      fetchClients.activity.GET([], {
        query: {
          ...(operatorId ? { operatorId } : {}),
          ...(adminId ? { adminId } : {}),
          limit,
          offset,
        },
      }),
  });

  if (activity.isPending) return <Splash />;
  if (activity.error) return <ErrorNotice error={activity.error} />;

  const { entries, total, operators, admins } = activity.data;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Activity</h1>
          <p>
            {role === "operator"
              ? "Everything you have done, newest first."
              : "Every state-changing action in your scope, newest first. Entries are never rewritten - a reassigned object keeps the history of who acted on it."}
          </p>
        </div>
      </div>

      <div className="stack">
        {role !== "operator" ? (
          <div className="row">
            {admins.length ? (
              <select
                value={adminId}
                onChange={(event) => {
                  setAdminId(event.target.value);
                  setOperatorId("");
                  setOffset(0);
                }}
                style={{ width: "auto" }}
              >
                <option value="">every admin</option>
                {admins.map((admin) => (
                  <option key={admin.id} value={admin.id}>
                    {admin.email}
                  </option>
                ))}
              </select>
            ) : null}

            <select
              value={operatorId}
              onChange={(event) => {
                setOperatorId(event.target.value);
                setOffset(0);
              }}
              style={{ width: "auto" }}
            >
              <option value="">every operator</option>
              {operators.map((operator) => (
                <option key={operator.id} value={operator.id}>
                  {operator.email}
                </option>
              ))}
            </select>

            <span className="faint">{total} entries</span>
          </div>
        ) : null}

        {entries.length === 0 ? (
          <Empty title="Nothing recorded yet" />
        ) : (
          <section className="panel">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Who</th>
                    <th>What</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="shrink faint">
                        <When at={entry.createdAt} />
                      </td>
                      <td>
                        <Actor entry={entry} />
                      </td>
                      <td>
                        {PHRASES[entry.action] ?? entry.action}{" "}
                        {entry.objectLabel ? <strong>{entry.objectLabel}</strong> : null}
                        {entry.detail?.error ? (
                          <div className="faint" style={{ color: "var(--danger)" }}>
                            {String(entry.detail.error)}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {total > limit ? (
              <div
                className="row"
                style={{ padding: "0.75rem 1rem", justifyContent: "space-between" }}
              >
                <button
                  type="button"
                  className="small"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                >
                  ← newer
                </button>
                <span className="faint">
                  {offset + 1}–{Math.min(offset + limit, total)} of {total}
                </span>
                <button
                  type="button"
                  className="small"
                  disabled={offset + limit >= total}
                  onClick={() => setOffset(offset + limit)}
                >
                  older →
                </button>
              </div>
            ) : null}
          </section>
        )}
      </div>
    </>
  );
}
