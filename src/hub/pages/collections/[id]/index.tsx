import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import fetchClients, { type ResponseT } from "_/fetch";

import Link from "~/components/Link";
import {
  Addresses,
  CopyableKey,
  DeliveryBadge,
  Empty,
  ErrorNotice,
  Field,
  Form,
  Notice,
  Splash,
  StateBadge,
  When,
} from "~/components/ui";
import { useSession } from "~/hooks/session";

type CollectionT = ResponseT["collections/[id]"]["GET"];
type EmailRowT = ResponseT["collections/[id]/emails"]["GET"]["emails"][number];
type OutcomeT = ResponseT["emails/actions/send"]["POST"]["outcomes"][number];

/**
 * The collection view (§5.3, §5.4).
 *
 * Emails awaiting review are listed first *and* visually marked - being sorted
 * to the top is not enough on a page you scroll. For an operator the rows are
 * selectable and bulk-sendable; for an admin observing, the same view is
 * read-only.
 */

const OutcomeReport = ({ outcomes }: { outcomes: Array<OutcomeT> }) => {
  const failed = outcomes.filter((outcome) => !outcome.ok);
  const sent = outcomes.length - failed.length;

  return (
    <Notice kind={failed.length ? "error" : "ok"}>
      {sent} of {outcomes.length} succeeded.
      {failed.length ? (
        <ul style={{ margin: "0.4rem 0 0", paddingLeft: "1.1rem" }}>
          {failed.map((outcome) => (
            <li key={outcome.id}>
              <code>{outcome.id.slice(0, 8)}</code> — {outcome.error ?? outcome.code}
            </li>
          ))}
        </ul>
      ) : null}
    </Notice>
  );
};

const Settings = ({
  collection,
  onDone,
}: {
  collection: CollectionT;
  onDone: () => void;
}) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [name, setName] = useState(collection.name);
  const [scheduleMode, setScheduleMode] = useState(collection.scheduleMode);
  const [providerId, setProviderId] = useState(collection.providerId ?? "");

  const choices = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetchClients.dashboard.GET(),
  });

  const save = useMutation({
    mutationFn: () =>
      fetchClients["collections/[id]"].PUT([collection.id], {
        json: { name, scheduleMode, providerId: providerId ? providerId : null },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries();
      onDone();
    },
  });

  const remove = useMutation({
    mutationFn: () => fetchClients["collections/[id]"].DELETE([collection.id]),
    onSuccess: () => {
      void queryClient.invalidateQueries();
      void navigate("/");
    },
  });

  return (
    <div className="card stack">
      <div className="card-head">
        <h3>Collection settings</h3>
        <button type="button" className="quiet small" onClick={onDone}>
          close
        </button>
      </div>

      <Form onSubmit={() => save.mutate()} className="stack">
        <div className="form-grid">
          <Field label="Name">
            <input value={name} required onChange={(event) => setName(event.target.value)} />
          </Field>

          <Field label="Schedule mode">
            <select
              value={scheduleMode}
              onChange={(event) =>
                setScheduleMode(event.target.value as CollectionT["scheduleMode"])
              }
            >
              <option value="after_review">after_review — hold for review</option>
              <option value="immediate">immediate — send without review</option>
            </select>
          </Field>

          <Field label="Provider">
            <select value={providerId} onChange={(event) => setProviderId(event.target.value)}>
              <option value="">none — stores but cannot send</option>
              {(choices.data?.providerChoices ?? []).map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.name} ({choice.type})
                </option>
              ))}
            </select>
          </Field>
        </div>

        <ErrorNotice error={save.error} />
        <ErrorNotice error={remove.error} />

        <div className="row" style={{ justifyContent: "space-between" }}>
          <button type="submit" className="primary" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save changes"}
          </button>

          <button
            type="button"
            className="danger"
            disabled={remove.isPending}
            onClick={() => {
              // Destructive: it takes the collection's emails with it (§5.3).
              const ok = window.confirm(
                `Delete "${collection.name}" and all ${collection.counters.total} of its emails?\n\n` +
                  "Any project still submitting with this id will start getting 401s.",
              );
              if (ok) remove.mutate();
            }}
          >
            Delete collection
          </button>
        </div>
      </Form>
    </div>
  );
};

export default function CollectionPage() {
  const { id = "" } = useParams();
  const session = useSession();
  const queryClient = useQueryClient();

  const [state, setState] = useState("");
  const [deliveryStatus, setDeliveryStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [report, setReport] = useState<Array<OutcomeT> | null>(null);

  const limit = 50;
  const canAct = session.data?.actor?.capabilities.manageCollections === true;

  const collection = useQuery({
    queryKey: ["collection", id],
    queryFn: () => fetchClients["collections/[id]"].GET([id]),
  });

  const emails = useQuery({
    queryKey: ["collection", id, "emails", state, deliveryStatus, offset],
    queryFn: () =>
      fetchClients["collections/[id]/emails"].GET([id], {
        query: {
          ...(state ? { state: state as "pending" } : {}),
          ...(deliveryStatus ? { deliveryStatus: deliveryStatus as "sent" } : {}),
          limit,
          offset,
        },
      }),
  });

  const afterAction = (outcomes: Array<OutcomeT>) => {
    setReport(outcomes);
    setSelected(new Set());
    void queryClient.invalidateQueries();
  };

  const approve = useMutation({
    mutationFn: (ids: Array<string>) =>
      fetchClients["emails/actions/approve"].POST([], { json: { ids } }),
    onSuccess: (result) => afterAction(result.outcomes),
  });

  const send = useMutation({
    mutationFn: (ids: Array<string>) =>
      fetchClients["emails/actions/send"].POST([], { json: { ids } }),
    onSuccess: (result) => afterAction(result.outcomes),
  });

  if (collection.isPending) return <Splash />;
  if (collection.error) return <ErrorNotice error={collection.error} />;

  const rows = emails.data?.emails ?? [];
  const total = emails.data?.total ?? 0;

  // Only `ready` emails are selectable and sendable (§5.4); `pending` ones are
  // selectable for approval instead.
  const selectable = rows.filter((row) => row.state !== "sent");
  const chosen = [...selected];
  const chosenRows = rows.filter((row) => selected.has(row.id));
  const readyChosen = chosenRows.filter((row) => row.state === "ready").map((row) => row.id);
  const pendingChosen = chosenRows.filter((row) => row.state === "pending").map((row) => row.id);

  const toggle = (rowId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{collection.data.name}</h1>
          <p>
            {collection.data.owner.email} ·{" "}
            {collection.data.scheduleMode === "immediate"
              ? "immediate — submitted mail is ready to send"
              : "after_review — submitted mail waits for a human"}{" "}
            · {collection.data.providerName ?? "no provider assigned"}
          </p>
        </div>

        {canAct ? (
          <button type="button" onClick={() => setSettingsOpen((open) => !open)}>
            Settings
          </button>
        ) : null}
      </div>

      <div className="stack">
        {settingsOpen && canAct ? (
          <Settings collection={collection.data} onDone={() => setSettingsOpen(false)} />
        ) : null}

        <div className="card">
          <div className="card-head">
            <h3>Submit with this id</h3>
          </div>
          <CopyableKey value={collection.data.id} />
          <p className="faint" style={{ marginBottom: 0 }}>
            Send it as the <code>x-collection-id</code> header, or as the SMTP password.
            It never changes - not on rename, not on reassignment.
          </p>
        </div>

        {report ? <OutcomeReport outcomes={report} /> : null}

        <section className="panel">
          <header>
            <div className="row">
              <select value={state} onChange={(event) => { setState(event.target.value); setOffset(0); }}>
                <option value="">any state</option>
                <option value="pending">pending</option>
                <option value="ready">ready</option>
                <option value="sent">sent</option>
              </select>

              <select
                value={deliveryStatus}
                onChange={(event) => { setDeliveryStatus(event.target.value); setOffset(0); }}
              >
                <option value="">any delivery status</option>
                <option value="unknown">unknown</option>
                <option value="sent">sent</option>
                <option value="delivered">delivered</option>
                <option value="bounced">bounced</option>
              </select>

              <span className="faint">{total} emails</span>
            </div>

            {canAct && chosen.length > 0 ? (
              <div className="row">
                <span className="faint">{chosen.length} selected</span>
                <button
                  type="button"
                  disabled={!pendingChosen.length || approve.isPending}
                  onClick={() => approve.mutate(pendingChosen)}
                >
                  Approve {pendingChosen.length || ""}
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={!readyChosen.length || send.isPending}
                  onClick={() => send.mutate(readyChosen)}
                >
                  {send.isPending ? "Sending…" : `Send ${readyChosen.length || ""}`}
                </button>
              </div>
            ) : null}
          </header>

          <ErrorNotice error={emails.error} />

          {emails.isPending ? (
            <Splash />
          ) : rows.length === 0 ? (
            <Empty title="No emails match">
              Submit one with <code>POST /api/emails</code>, or over SMTP.
            </Empty>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {canAct ? (
                      <th className="shrink">
                        <input
                          type="checkbox"
                          aria-label="Select all"
                          checked={selectable.length > 0 && selected.size === selectable.length}
                          onChange={(event) =>
                            setSelected(
                              event.target.checked
                                ? new Set(selectable.map((row) => row.id))
                                : new Set(),
                            )
                          }
                        />
                      </th>
                    ) : null}
                    <th>Subject</th>
                    <th>To</th>
                    <th>State</th>
                    <th>Delivery</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row: EmailRowT) => (
                    <tr
                      key={row.id}
                      className={row.state === "pending" ? "awaiting-review" : undefined}
                    >
                      {canAct ? (
                        <td className="shrink">
                          <input
                            type="checkbox"
                            aria-label={`Select ${row.subject}`}
                            disabled={row.state === "sent"}
                            checked={selected.has(row.id)}
                            onChange={() => toggle(row.id)}
                          />
                        </td>
                      ) : null}
                      <td>
                        <Link to={["emails/[id]", row.id]}>{row.subject || <em>(no subject)</em>}</Link>
                        {row.lastError ? (
                          <div className="faint" style={{ color: "var(--danger)" }}>
                            {row.attempts} attempt{row.attempts === 1 ? "" : "s"} · {row.lastError}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <Addresses list={row.to} />
                      </td>
                      <td className="shrink">
                        <StateBadge state={row.state} />
                      </td>
                      <td className="shrink">
                        <DeliveryBadge status={row.deliveryStatus} />
                      </td>
                      <td className="shrink faint">
                        <When at={row.createdAt} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {total > limit ? (
            <div className="row" style={{ padding: "0.75rem 1rem", justifyContent: "space-between" }}>
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
      </div>
    </>
  );
}
