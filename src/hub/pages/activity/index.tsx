import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import fetchClients, { type ResponseT } from "_/fetch";

import { Empty, PageHeading, PageSkeleton, When, errorMessage } from "~/components/domain";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
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
  if (entry.actorKind !== "user") {
    return (
      <Badge variant="neutral">
        {entry.actorKind === "sender" ? "background sender" : "SMTP listener"}
      </Badge>
    );
  }

  return (
    <div className="flex flex-col">
      <span className="font-medium">{entry.actorEmail}</span>
      {entry.impersonatorEmail ? (
        // Impersonation is an audited convenience, not a disguise (§2.2).
        <span className="text-pending text-xs">
          via impersonation by {entry.impersonatorEmail}
        </span>
      ) : null}
    </div>
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

  if (activity.isPending) return <PageSkeleton />;
  if (activity.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{errorMessage(activity.error)}</AlertDescription>
      </Alert>
    );
  }

  const { entries, total, operators, admins } = activity.data;

  return (
    <>
      <PageHeading
        title="Activity"
        description={
          role === "operator"
            ? "Everything you have done, newest first."
            : "Every state-changing action in your scope, newest first. Entries are never rewritten - a reassigned object keeps the history of who acted on it."
        }
        actions={
          role !== "operator" ? (
            <div className="flex flex-wrap gap-2">
              {admins.length ? (
                <Select
                  value={adminId || "all"}
                  onValueChange={(value) => {
                    setAdminId(value === "all" ? "" : value);
                    setOperatorId("");
                    setOffset(0);
                  }}
                >
                  <SelectTrigger size="sm" className="w-52">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Every admin</SelectItem>
                    {admins.map((admin) => (
                      <SelectItem key={admin.id} value={admin.id}>
                        {admin.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}

              <Select
                value={operatorId || "all"}
                onValueChange={(value) => {
                  setOperatorId(value === "all" ? "" : value);
                  setOffset(0);
                }}
              >
                <SelectTrigger size="sm" className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Every operator</SelectItem>
                  {operators.map((operator) => (
                    <SelectItem key={operator.id} value={operator.id}>
                      {operator.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null
        }
      />

      <Card className="overflow-hidden">
        {entries.length === 0 ? (
          <Empty title="Nothing recorded yet" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">When</TableHead>
                <TableHead className="w-72">Who</TableHead>
                <TableHead>What</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    <When at={entry.createdAt} />
                  </TableCell>
                  <TableCell>
                    <Actor entry={entry} />
                  </TableCell>
                  <TableCell>
                    <span className="text-muted-foreground">
                      {PHRASES[entry.action] ?? entry.action}
                    </span>{" "}
                    {entry.objectLabel ? (
                      <span className="font-medium">{entry.objectLabel}</span>
                    ) : null}
                    {entry.detail?.error ? (
                      <div className="text-bounced text-xs">
                        {String(entry.detail.error)}
                      </div>
                    ) : null}
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
              &larr; Newer
            </Button>
            <span className="text-muted-foreground tnum text-xs">
              {offset + 1}&ndash;{Math.min(offset + limit, total)} of {total}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={offset + limit >= total}
              onClick={() => setOffset(offset + limit)}
            >
              Older &rarr;
            </Button>
          </div>
        ) : null}
      </Card>
    </>
  );
}
