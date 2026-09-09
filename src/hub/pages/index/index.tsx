import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import fetchClients, { type ResponseT } from "_/fetch";

import Link from "~/components/Link";
import { Empty, ErrorNotice, Field, Form, Splash } from "~/components/ui";
import { useSession } from "~/hooks/session";

type DashboardT = ResponseT["dashboard"]["GET"];
type CardT = DashboardT["collections"][number];

/**
 * The dashboard (§5.2) - the landing view for every role.
 *
 * One card per collection, with live counts. What differs by role is only the
 * set of cards and whether the create form is there at all: an operator sees
 * their own and can add to them, an admin sees all their operators' labelled
 * by owner, and the superadmin sees across every admin. Read-only means no
 * controls, not disabled ones.
 */

const Counters = ({ counters }: { counters: CardT["counters"] }) => (
  <div className="counters">
    <div className={`counter${counters.pending > 0 ? " has-pending" : ""}`}>
      <b>{counters.pending}</b>
      <span>pending</span>
    </div>
    <div className="counter">
      <b>{counters.ready}</b>
      <span>ready</span>
    </div>
    <div className="counter">
      <b>{counters.sent}</b>
      <span>sent</span>
    </div>
    <div className="counter">
      <b>{counters.total}</b>
      <span>total</span>
    </div>
    <div className="counter">
      <b>{counters.delivered}</b>
      <span>delivered</span>
    </div>
    <div className="counter">
      <b>{counters.bounced}</b>
      <span>bounced</span>
    </div>
  </div>
);

const CollectionCard = ({ card, showOwner }: { card: CardT; showOwner: boolean }) => (
  <Link to={["collections/[id]", card.id]} className="card link" style={{ color: "inherit" }}>
    <div className="card-head">
      <h3>{card.name}</h3>
      <span className={`badge ${card.scheduleMode === "immediate" ? "sent" : "pending"}`}>
        {card.scheduleMode === "immediate" ? "immediate" : "review"}
      </span>
    </div>

    <div className="faint">
      {showOwner ? <>{card.owner.email} · </> : null}
      {card.providerName ?? <em>no provider - cannot send</em>}
    </div>

    <Counters counters={card.counters} />
  </Link>
);

const CreateCollection = ({ choices }: { choices: DashboardT["providerChoices"] }) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [scheduleMode, setScheduleMode] = useState<"after_review" | "immediate">(
    "after_review",
  );
  const [providerId, setProviderId] = useState("");

  const create = useMutation({
    mutationFn: () =>
      fetchClients.collections.POST([], {
        json: {
          name,
          scheduleMode,
          providerId: providerId ? providerId : null,
        },
      }),
    onSuccess: () => {
      setOpen(false);
      setName("");
      setProviderId("");
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  if (!open) {
    return (
      <button type="button" className="primary" onClick={() => setOpen(true)}>
        New collection
      </button>
    );
  }

  return (
    <div className="card" style={{ width: "min(520px, 100%)" }}>
      <div className="card-head">
        <h3>New collection</h3>
        <button type="button" className="quiet small" onClick={() => setOpen(false)}>
          cancel
        </button>
      </div>

      <Form onSubmit={() => create.mutate()} className="stack">
        <Field label="Name">
          <input
            value={name}
            required
            maxLength={120}
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <div className="form-grid">
          <Field label="Schedule mode">
            <select
              value={scheduleMode}
              onChange={(event) =>
                setScheduleMode(event.target.value as "after_review" | "immediate")
              }
            >
              <option value="after_review">after_review — hold for review</option>
              <option value="immediate">immediate — send without review</option>
            </select>
          </Field>

          <Field label="Provider">
            <select value={providerId} onChange={(event) => setProviderId(event.target.value)}>
              <option value="">none — stores but cannot send</option>
              {choices.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.name} ({choice.type})
                </option>
              ))}
            </select>
          </Field>
        </div>

        <ErrorNotice error={create.error} />

        <div className="row">
          <button type="submit" className="primary" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create collection"}
          </button>
          {choices.length === 0 ? (
            <span className="faint">
              Your admin has configured no providers yet - the collection will store
              mail but not send it.
            </span>
          ) : null}
        </div>
      </Form>
    </div>
  );
};

export default function DashboardPage() {
  const session = useSession();
  const actor = session.data?.actor;

  const dashboard = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetchClients.dashboard.GET(),
  });

  if (dashboard.isPending) return <Splash />;
  if (dashboard.error) return <ErrorNotice error={dashboard.error} />;

  const canCreate = actor?.capabilities.manageCollections === true;
  const showOwner = actor?.identity.role !== "operator";
  const cards = dashboard.data?.collections ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Collections</h1>
          <p>
            {showOwner
              ? "Everything your operators are sending, read-only. Impersonate an operator to act on it."
              : "One per project, or per email stream. The collection id is the API key your project submits with."}
          </p>
        </div>
        {canCreate ? <CreateCollection choices={dashboard.data.providerChoices} /> : null}
      </div>

      {cards.length === 0 ? (
        <Empty title="No collections yet">
          {canCreate
            ? "Create one, then point a project at its id."
            : "Your operators have not created any."}
        </Empty>
      ) : (
        <div className="grid">
          {cards.map((card) => (
            <CollectionCard key={card.id} card={card} showOwner={showOwner} />
          ))}
        </div>
      )}
    </>
  );
}
