import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router";

import fetchClients from "_/fetch";

import Link from "~/components/Link";
import {
  Addresses,
  DeliveryBadge,
  ErrorNotice,
  Notice,
  Splash,
  StateBadge,
  When,
} from "~/components/ui";
import { useSession } from "~/hooks/session";

/**
 * The email view (§5.5).
 *
 * Everything about one email, plus the three actions an operator can take on
 * it. The preview is the part worth reading carefully: stored email content is
 * untrusted input - it was written by whatever project submitted it - so it is
 * rendered in a sandboxed frame that cannot reach this document, run scripts,
 * or navigate the page.
 */

const Preview = ({ html }: { html: string }) => (
  <iframe
    className="preview"
    title="Email preview"
    // No allow-scripts and no allow-same-origin: the frame gets a unique
    // opaque origin, so the stored HTML cannot touch the hub's session,
    // storage, or DOM (§5.5).
    sandbox=""
    referrerPolicy="no-referrer"
    srcDoc={html}
  />
);

export default function EmailPage() {
  const { id = "" } = useParams();
  const session = useSession();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const canAct = session.data?.actor?.capabilities.manageCollections === true;

  const email = useQuery({
    queryKey: ["email", id],
    queryFn: () => fetchClients["emails/[id]"].GET([id]),
  });

  const account = useQuery({
    queryKey: ["account"],
    queryFn: () => fetchClients.account.GET(),
    enabled: canAct,
  });

  const [testAddressId, setTestAddressId] = useState("");
  const testAddresses = account.data?.testAddresses ?? [];
  // Defaults to the most recently added (§5.5) - the list arrives newest-first.
  const chosenTestAddress = testAddressId || testAddresses[0]?.id || "";

  const refresh = () => void queryClient.invalidateQueries();

  const approve = useMutation({
    mutationFn: () => fetchClients["emails/actions/approve"].POST([], { json: { ids: [id] } }),
    onSuccess: (result) => {
      const outcome = result.outcomes[0];
      setNotice(
        outcome?.ok
          ? { kind: "ok", text: "Approved - it is now cleared for sending." }
          : { kind: "error", text: outcome?.error ?? "Could not approve" },
      );
      refresh();
    },
  });

  const send = useMutation({
    mutationFn: () => fetchClients["emails/actions/send"].POST([], { json: { ids: [id] } }),
    onSuccess: (result) => {
      const outcome = result.outcomes[0];
      setNotice(
        outcome?.ok
          ? { kind: "ok", text: "Handed to the provider." }
          : { kind: "error", text: outcome?.error ?? "Could not send" },
      );
      refresh();
    },
  });

  const testSend = useMutation({
    mutationFn: () =>
      fetchClients["emails/actions/test-send"].POST([], {
        json: { emailId: id, testAddressId: chosenTestAddress },
      }),
    onSuccess: (result) => {
      setNotice({ kind: "ok", text: `A [test] copy went to ${result.sentTo}.` });
    },
    onError: (error) => {
      setNotice({ kind: "error", text: String((error as Error).message) });
    },
  });

  if (email.isPending) return <Splash />;
  if (email.error) return <ErrorNotice error={email.error} />;

  const data = email.data;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{data.subject || <em>(no subject)</em>}</h1>
          <p>
            <Link to={["collections/[id]", data.collectionId]}>back to the collection</Link>
          </p>
        </div>

        <div className="row">
          {canAct && data.state === "pending" ? (
            <button
              type="button"
              className="primary"
              disabled={approve.isPending}
              onClick={() => approve.mutate()}
            >
              {approve.isPending ? "Approving…" : "Approve"}
            </button>
          ) : null}

          {canAct && data.state === "ready" ? (
            <button
              type="button"
              className="primary"
              disabled={send.isPending}
              onClick={() => send.mutate()}
            >
              {send.isPending ? "Sending…" : "Send"}
            </button>
          ) : null}

          {canAct ? (
            testAddresses.length ? (
              <>
                <select
                  aria-label="Test address"
                  value={chosenTestAddress}
                  onChange={(event) => setTestAddressId(event.target.value)}
                  style={{ width: "auto" }}
                >
                  {testAddresses.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label ? `${entry.label} — ${entry.address}` : entry.address}
                    </option>
                  ))}
                </select>
                <button type="button" disabled={testSend.isPending} onClick={() => testSend.mutate()}>
                  {testSend.isPending ? "Sending…" : "Send to me"}
                </button>
              </>
            ) : (
              // Unavailable until at least one test address exists (§2.5), so
              // the control points at where to add one.
              <Link to={["account"]} className="button">
                Add a test address to use “Send to me”
              </Link>
            )
          ) : null}
        </div>
      </div>

      <div className="stack">
        {notice ? <Notice kind={notice.kind}>{notice.text}</Notice> : null}

        <div className="card">
          <dl className="facts">
            <dt>State</dt>
            <dd>
              <StateBadge state={data.state} />
            </dd>

            <dt>Delivery</dt>
            <dd>
              <DeliveryBadge status={data.deliveryStatus} />
            </dd>

            <dt>From</dt>
            <dd>
              <Addresses list={[data.from]} />
            </dd>

            <dt>To</dt>
            <dd>{data.to.map((entry) => entry.address).join(", ")}</dd>

            {data.cc.length ? (
              <>
                <dt>Cc</dt>
                <dd>{data.cc.map((entry) => entry.address).join(", ")}</dd>
              </>
            ) : null}

            {data.bcc.length ? (
              <>
                <dt>Bcc</dt>
                <dd>{data.bcc.map((entry) => entry.address).join(", ")}</dd>
              </>
            ) : null}

            <dt>Received</dt>
            <dd>
              <When at={data.createdAt} /> · over {data.source === "smtp" ? "SMTP" : "HTTP"}
            </dd>

            <dt>Reviewed</dt>
            <dd>
              <When at={data.reviewedAt} />
            </dd>

            <dt>Sent</dt>
            <dd>
              <When at={data.sentAt} />
            </dd>

            <dt>Attempts</dt>
            <dd>{data.attempts}</dd>

            {data.providerMessageId ? (
              <>
                <dt>Message id</dt>
                <dd className="mono">{data.providerMessageId}</dd>
              </>
            ) : null}

            {data.lastError ? (
              <>
                <dt>Last error</dt>
                <dd style={{ color: "var(--danger)" }}>{data.lastError}</dd>
              </>
            ) : null}
          </dl>
        </div>

        {data.html ? (
          <section className="panel">
            <header>
              <h2>HTML preview</h2>
              <span className="faint">rendered in an isolated frame</span>
            </header>
            <div className="body">
              <Preview html={data.html} />
            </div>
          </section>
        ) : null}

        {data.text ? (
          <section className="panel">
            <header>
              <h2>Text body</h2>
            </header>
            <div className="body">
              <pre className="body-text">{data.text}</pre>
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}
