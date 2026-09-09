import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, SendIcon, SettingsIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import fetchClients, { type ResponseT } from "_/fetch";

import { ConfirmDialog } from "~/components/ConfirmDialog";
import Link from "~/components/Link";
import {
  Addresses,
  CopyableKey,
  DeliveryBadge,
  Empty,
  PageHeading,
  PageSkeleton,
  StateBadge,
  When,
  errorMessage,
} from "~/components/domain";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
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
import { Skeleton } from "~/components/ui/skeleton";
import { toast } from "~/components/ui/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { useSession } from "~/hooks/session";
import { cn } from "~/lib/utils";

type CollectionT = ResponseT["collections/[id]"]["GET"];
type OutcomeT = ResponseT["emails/actions/send"]["POST"]["outcomes"][number];

/**
 * The collection view (§5.3, §5.4).
 *
 * Emails awaiting review are listed first *and* visually marked - on a page
 * you scroll, being at the top is not the same as being noticeable. For an
 * operator the rows are selectable and actionable in bulk; for an admin
 * observing, the same view is read-only, with no controls rather than disabled
 * ones.
 */

/** Per-email outcomes (§4.2), reported as a toast so the table stays put. */
const reportOutcomes = (outcomes: Array<OutcomeT>, verb: string) => {
  const failed = outcomes.filter((outcome) => !outcome.ok);
  const ok = outcomes.length - failed.length;

  if (!failed.length) {
    toast.success(`${ok} ${ok === 1 ? "email" : "emails"} ${verb}`);
    return;
  }

  toast.error(`${ok} of ${outcomes.length} ${verb}`, {
    description: failed
      .slice(0, 4)
      .map((outcome) => `${outcome.id.slice(0, 8)}: ${outcome.error ?? outcome.code}`)
      .join("\n"),
    duration: 8000,
  });
};

const SettingsDialog = ({
  collection,
  open,
  onOpenChange,
}: {
  collection: CollectionT;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [name, setName] = useState(collection.name);
  const [scheduleMode, setScheduleMode] = useState<string>(collection.scheduleMode);
  const [providerId, setProviderId] = useState(collection.providerId ?? "none");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const choices = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetchClients.dashboard.GET(),
  });

  const save = useMutation({
    mutationFn: () =>
      fetchClients["collections/[id]"].PUT([collection.id], {
        json: {
          name,
          scheduleMode: scheduleMode as "after_review",
          providerId: providerId === "none" ? null : providerId,
        },
      }),
    onSuccess: () => {
      toast.success("Collection updated");
      void queryClient.invalidateQueries();
      onOpenChange(false);
    },
  });

  const remove = useMutation({
    mutationFn: () => fetchClients["collections/[id]"].DELETE([collection.id]),
    onSuccess: () => {
      toast.success(`Deleted “${collection.name}”`);
      void queryClient.invalidateQueries();
      void navigate("/");
    },
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Collection settings</DialogTitle>
          </DialogHeader>

          <form
            id="collection-settings"
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                required
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
                  {(choices.data?.providerChoices ?? []).map((choice) => (
                    <SelectItem key={choice.id} value={choice.id}>
                      {choice.name} ({choice.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {save.error ? (
              <Alert variant="destructive">
                <AlertDescription>{errorMessage(save.error)}</AlertDescription>
              </Alert>
            ) : null}
          </form>

          <DialogFooter className="sm:justify-between">
            <Button
              variant="ghost"
              className="text-destructive hover:bg-destructive/10"
              onClick={() => {
                // One dialog at a time - the settings sheet steps aside rather
                // than sitting visibly behind the confirmation.
                onOpenChange(false);
                setConfirmingDelete(true);
              }}
            >
              <Trash2Icon />
              Delete
            </Button>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" form="collection-settings" disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={`Delete “${collection.name}”?`}
        description="This cannot be undone."
        destructive
        confirmLabel="Delete collection"
        typeToConfirm={collection.name}
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
        body={
          <Alert variant="destructive">
            <AlertDescription>
              Its {collection.counters.total} stored{" "}
              {collection.counters.total === 1 ? "email goes" : "emails go"} with it, and
              any project still submitting with this id will start getting 401s.
            </AlertDescription>
          </Alert>
        }
      />
    </>
  );
};

export default function CollectionPage() {
  const { id = "" } = useParams();
  const session = useSession();
  const queryClient = useQueryClient();

  const [state, setState] = useState("any");
  const [deliveryStatus, setDeliveryStatus] = useState("any");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);

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
          ...(state === "any" ? {} : { state: state as "pending" }),
          ...(deliveryStatus === "any" ? {} : { deliveryStatus: deliveryStatus as "sent" }),
          limit,
          offset,
        },
      }),
  });

  const afterAction = (outcomes: Array<OutcomeT>, verb: string) => {
    reportOutcomes(outcomes, verb);
    setSelected(new Set());
    void queryClient.invalidateQueries();
  };

  const approve = useMutation({
    mutationFn: (ids: Array<string>) =>
      fetchClients["emails/actions/approve"].POST([], { json: { ids } }),
    onSuccess: (result) => afterAction(result.outcomes, "approved"),
  });

  const send = useMutation({
    mutationFn: (ids: Array<string>) =>
      fetchClients["emails/actions/send"].POST([], { json: { ids } }),
    onSuccess: (result) => afterAction(result.outcomes, "sent"),
  });

  if (collection.isPending) return <PageSkeleton />;
  if (collection.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{errorMessage(collection.error)}</AlertDescription>
      </Alert>
    );
  }

  const rows = emails.data?.emails ?? [];
  const total = emails.data?.total ?? 0;

  // Only `ready` emails are sendable (§5.4); `pending` ones can be approved.
  const selectable = rows.filter((row) => row.state !== "sent");
  const chosen = rows.filter((row) => selected.has(row.id));
  const readyChosen = chosen.filter((row) => row.state === "ready").map((row) => row.id);
  const pendingChosen = chosen
    .filter((row) => row.state === "pending")
    .map((row) => row.id);

  const toggle = (rowId: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });

  return (
    <>
      <PageHeading
        title={collection.data.name}
        description={
          <>
            {collection.data.owner.email} ·{" "}
            {collection.data.scheduleMode === "immediate"
              ? "immediate — submitted mail is ready to send"
              : "after_review — submitted mail waits for a human"}{" "}
            · {collection.data.providerName ?? "no provider assigned"}
          </>
        }
        actions={
          canAct ? (
            <Button variant="outline" onClick={() => setSettingsOpen(true)}>
              <SettingsIcon />
              Settings
            </Button>
          ) : null
        }
      />

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Submit with this id</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <CopyableKey value={collection.data.id} />
            <p className="text-muted-foreground text-xs">
              Send it as the <code className="font-mono">x-collection-id</code> header,
              or as the SMTP password. It never changes — not on rename, not on
              reassignment.
            </p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={state}
                onValueChange={(value) => {
                  setState(value);
                  setOffset(0);
                }}
              >
                <SelectTrigger size="sm" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any state</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="ready">Ready</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={deliveryStatus}
                onValueChange={(value) => {
                  setDeliveryStatus(value);
                  setOffset(0);
                }}
              >
                <SelectTrigger size="sm" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any delivery status</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="bounced">Bounced</SelectItem>
                </SelectContent>
              </Select>

              <span className="text-muted-foreground text-xs">
                {total} {total === 1 ? "email" : "emails"}
              </span>
            </div>

            {canAct && chosen.length > 0 ? (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">
                  {chosen.length} selected
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!pendingChosen.length || approve.isPending}
                  onClick={() => approve.mutate(pendingChosen)}
                >
                  <CheckIcon />
                  Approve {pendingChosen.length || ""}
                </Button>
                <Button
                  size="sm"
                  disabled={!readyChosen.length || send.isPending}
                  onClick={() => send.mutate(readyChosen)}
                >
                  <SendIcon />
                  {send.isPending ? "Sending…" : `Send ${readyChosen.length || ""}`}
                </Button>
              </div>
            ) : null}
          </CardHeader>

          {emails.isPending ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          ) : rows.length === 0 ? (
            <Empty title="No emails match">
              Submit one with <code className="font-mono">POST /api/emails</code>, or over
              SMTP.
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {canAct ? (
                    <TableHead className="w-10">
                      <Checkbox
                        aria-label="Select all"
                        checked={
                          selectable.length > 0 && selected.size === selectable.length
                        }
                        onCheckedChange={(checked) =>
                          setSelected(
                            checked ? new Set(selectable.map((row) => row.id)) : new Set(),
                          )
                        }
                      />
                    </TableHead>
                  ) : null}
                  <TableHead>Subject</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Delivery</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={selected.has(row.id) ? "selected" : undefined}
                    className={cn(
                      row.state === "pending" &&
                        "bg-pending-soft/50 hover:bg-pending-soft/70 shadow-[inset_3px_0_0_var(--pending)]",
                    )}
                  >
                    {canAct ? (
                      <TableCell>
                        <Checkbox
                          aria-label={`Select ${row.subject}`}
                          disabled={row.state === "sent"}
                          checked={selected.has(row.id)}
                          onCheckedChange={() => toggle(row.id)}
                        />
                      </TableCell>
                    ) : null}

                    <TableCell className="max-w-xs">
                      <Link
                        to={["emails/[id]", row.id]}
                        className="block truncate font-medium"
                      >
                        {row.subject || <em className="font-normal">(no subject)</em>}
                      </Link>
                      {row.lastError ? (
                        <div className="text-bounced truncate text-xs">
                          {row.attempts} attempt{row.attempts === 1 ? "" : "s"} ·{" "}
                          {row.lastError}
                        </div>
                      ) : null}
                    </TableCell>

                    <TableCell className="text-muted-foreground max-w-48">
                      <Addresses list={row.to} />
                    </TableCell>

                    <TableCell>
                      <StateBadge state={row.state} />
                    </TableCell>

                    <TableCell>
                      <DeliveryBadge status={row.deliveryStatus} />
                    </TableCell>

                    <TableCell className="text-muted-foreground text-right text-xs whitespace-nowrap">
                      <When at={row.createdAt} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {total > limit ? (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <Button
                variant="outline"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
              >
                ← Newer
              </Button>
              <span className="text-muted-foreground tnum text-xs">
                {offset + 1}–{Math.min(offset + limit, total)} of {total}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={offset + limit >= total}
                onClick={() => setOffset(offset + limit)}
              >
                Older →
              </Button>
            </div>
          ) : null}
        </Card>
      </div>

      {canAct ? (
        <SettingsDialog
          collection={collection.data}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
        />
      ) : null}
    </>
  );
}
