import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircleIcon, InboxIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import fetchClients, { type ResponseT } from "_/fetch";

import Link from "~/components/Link";
import { Empty, PageHeading, PageSkeleton, errorMessage } from "~/components/domain";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { toast } from "~/components/ui/sonner";
import { useSession } from "~/hooks/session";
import { cn } from "~/lib/utils";

type DashboardT = ResponseT["dashboard"]["GET"];
type CardT = DashboardT["collections"][number];

/**
 * The dashboard (§5.2) - the landing view for every role.
 *
 * One card per collection with live counts. What differs by role is the set of
 * cards and whether the create action is there at all: an operator sees their
 * own and can add to them, an admin sees all their operators' labelled by
 * owner, and the superadmin sees across every admin, grouped by which one.
 * Read-only means no controls, not disabled ones.
 */

const Counter = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "pending" | "sent" | "bounced";
}) => (
  <div
    className={cn(
      "rounded-md px-2 py-1.5 text-center",
      tone === "pending" && value > 0
        ? "bg-pending-soft text-pending"
        : tone === "bounced" && value > 0
          ? "bg-bounced-soft text-bounced"
          : tone === "sent" && value > 0
            ? "bg-sent-soft text-sent"
            : "bg-muted text-muted-foreground",
    )}
  >
    <div className="tnum text-foreground/90 text-base leading-tight font-semibold">
      {value}
    </div>
    <div className="text-[0.625rem] tracking-wide uppercase">{label}</div>
  </div>
);

const CollectionCard = ({ card, showOwner }: { card: CardT; showOwner: boolean }) => (
  <Link
    to={["collections/[id]", card.id]}
    className="focus-visible:ring-ring block rounded-xl no-underline"
  >
    <Card className="hover:border-primary/40 h-full p-4 transition-colors">
      <div className="mb-1 flex items-start justify-between gap-2">
        <h3 className="truncate font-semibold">{card.name}</h3>
        <Badge variant={card.scheduleMode === "immediate" ? "sent" : "pending"}>
          {card.scheduleMode === "immediate" ? "immediate" : "review"}
        </Badge>
      </div>

      <p className="text-muted-foreground mb-3 truncate text-xs">
        {showOwner ? `${card.owner.email} · ` : ""}
        {card.providerName ?? "no provider — cannot send"}
      </p>

      <div className="grid grid-cols-3 gap-1.5">
        <Counter label="pending" value={card.counters.pending} tone="pending" />
        <Counter label="ready" value={card.counters.ready} />
        <Counter label="sent" value={card.counters.sent} tone="sent" />
        <Counter label="total" value={card.counters.total} />
        <Counter label="delivered" value={card.counters.delivered} tone="sent" />
        <Counter label="bounced" value={card.counters.bounced} tone="bounced" />
      </div>
    </Card>
  </Link>
);

const CreateCollectionDialog = ({
  choices,
}: {
  choices: DashboardT["providerChoices"];
}) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [scheduleMode, setScheduleMode] = useState("after_review");
  const [providerId, setProviderId] = useState("none");

  const create = useMutation({
    mutationFn: () =>
      fetchClients.collections.POST([], {
        json: {
          name,
          scheduleMode: scheduleMode as "after_review",
          providerId: providerId === "none" ? null : providerId,
        },
      }),
    onSuccess: (collection) => {
      setOpen(false);
      setName("");
      setProviderId("none");
      toast.success(`Collection “${collection.name}” created`, {
        description: "Its id is the API key your project submits with.",
      });
      void queryClient.invalidateQueries();
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon />
        New collection
      </Button>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>New collection</DialogTitle>
          <DialogDescription>
            One per project, or per email stream within one.
          </DialogDescription>
        </DialogHeader>

        <form
          id="create-collection"
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="collection-name">Name</Label>
            <Input
              id="collection-name"
              value={name}
              required
              maxLength={120}
              autoFocus
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Schedule mode</Label>
            <Select value={scheduleMode} onValueChange={setScheduleMode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="after_review">
                  after_review — hold for review
                </SelectItem>
                <SelectItem value="immediate">
                  immediate — send without review
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Provider</Label>
            <Select value={providerId} onValueChange={setProviderId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">none — stores but cannot send</SelectItem>
                {choices.map((choice) => (
                  <SelectItem key={choice.id} value={choice.id}>
                    {choice.name} ({choice.type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {choices.length === 0 ? (
            <Alert variant="warning">
              <AlertCircleIcon />
              <AlertDescription>
                Your admin has configured no providers yet, so this collection will
                store mail but not send it.
              </AlertDescription>
            </Alert>
          ) : null}

          {create.error ? (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage(create.error)}</AlertDescription>
            </Alert>
          ) : null}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="create-collection" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create collection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** Cards under the admin whose subtree they sit in, admins in name order. */
const groupByAdmin = (cards: Array<CardT>): Map<string, Array<CardT>> => {
  const groups = new Map<string, Array<CardT>>();
  for (const card of cards) {
    const label = card.admin?.email ?? "no admin";
    groups.set(label, [...(groups.get(label) ?? []), card]);
  }
  return new Map([...groups].sort(([a], [b]) => a.localeCompare(b)));
};

export default function DashboardPage() {
  const session = useSession();
  const actor = session.data?.actor;

  const dashboard = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetchClients.dashboard.GET(),
  });

  if (dashboard.isPending) return <PageSkeleton />;
  if (dashboard.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{errorMessage(dashboard.error)}</AlertDescription>
      </Alert>
    );
  }

  const canCreate = actor?.capabilities.manageCollections === true;
  const showOwner = actor?.identity.role !== "operator";
  const cards = dashboard.data.collections;

  return (
    <>
      <PageHeading
        title="Collections"
        description={
          showOwner
            ? "Everything your operators are sending, read-only. Impersonate an operator to act on it."
            : "One per project, or per email stream. The collection id is the API key your project submits with."
        }
        actions={
          canCreate ? (
            <CreateCollectionDialog choices={dashboard.data.providerChoices} />
          ) : null
        }
      />

      {cards.length === 0 ? (
        <Card>
          <Empty
            title="No collections yet"
            action={
              canCreate ? (
                <CreateCollectionDialog choices={dashboard.data.providerChoices} />
              ) : null
            }
          >
            {canCreate ? (
              <>
                <InboxIcon className="mx-auto mb-2 size-5 opacity-60" />
                Create one, then point a project at its id.
              </>
            ) : (
              "Your operators have not created any."
            )}
          </Empty>
        </Card>
      ) : actor?.identity.role === "superadmin" ? (
        // Only the superadmin sees across admins, so only there does grouping
        // mean anything - this is the drill-down §5.8 asks for.
        <div className="space-y-8">
          {[...groupByAdmin(cards)].map(([label, group]) => (
            <section key={label}>
              <h2 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
                {label}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.map((card) => (
                  <CollectionCard key={card.id} card={card} showOwner />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <CollectionCard key={card.id} card={card} showOwner={showOwner} />
          ))}
        </div>
      )}
    </>
  );
}
