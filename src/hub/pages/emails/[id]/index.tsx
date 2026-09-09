import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, CheckIcon, SendIcon, TestTubeIcon } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router";

import fetchClients from "_/fetch";

import Link from "~/components/Link";
import {
  Addresses,
  DeliveryBadge,
  PageSkeleton,
  StateBadge,
  When,
  errorMessage,
} from "~/components/domain";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { toast } from "~/components/ui/sonner";
import { useSession } from "~/hooks/session";

/**
 * The email view (§5.5).
 *
 * Everything about one email, plus the three actions an operator can take on
 * it. The preview is the part worth reading carefully: stored content is
 * untrusted input, written by whatever project submitted it, so it renders in
 * a frame with an empty sandbox and no same-origin - an opaque origin that
 * cannot reach this document, run script, or navigate the page.
 */

const Fact = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <>
    <dt className="text-muted-foreground text-[0.6875rem] tracking-wide uppercase">
      {label}
    </dt>
    <dd className="mb-2 min-w-0 text-sm break-words">{children}</dd>
  </>
);

export default function EmailPage() {
  const { id = "" } = useParams();
  const session = useSession();
  const queryClient = useQueryClient();

  const canAct = session.data?.actor?.capabilities.manageCollections === true;
  const [testAddressId, setTestAddressId] = useState("");

  const email = useQuery({
    queryKey: ["email", id],
    queryFn: () => fetchClients["emails/[id]"].GET([id]),
  });

  const account = useQuery({
    queryKey: ["account"],
    queryFn: () => fetchClients.account.GET(),
    enabled: canAct,
  });

  const testAddresses = account.data?.testAddresses ?? [];
  // Defaults to the most recently added (§5.5) - the list arrives newest first.
  const chosenTestAddress = testAddressId || testAddresses[0]?.id || "";

  const refresh = () => void queryClient.invalidateQueries();

  const approve = useMutation({
    mutationFn: () => fetchClients["emails/actions/approve"].POST([], { json: { ids: [id] } }),
    onSuccess: (result) => {
      const outcome = result.outcomes[0];
      if (outcome?.ok) toast.success("Approved — cleared for sending");
      else toast.error(outcome?.error ?? "Could not approve");
      refresh();
    },
  });

  const send = useMutation({
    mutationFn: () => fetchClients["emails/actions/send"].POST([], { json: { ids: [id] } }),
    onSuccess: (result) => {
      const outcome = result.outcomes[0];
      if (outcome?.ok) toast.success("Handed to the provider");
      else toast.error(outcome?.error ?? "Could not send");
      refresh();
    },
  });

  const testSend = useMutation({
    mutationFn: () =>
      fetchClients["emails/actions/test-send"].POST([], {
        json: { emailId: id, testAddressId: chosenTestAddress },
      }),
    onSuccess: (result) =>
      toast.success(`A [test] copy went to ${result.sentTo}`, {
        description: "The stored email is untouched.",
      }),
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (email.isPending) return <PageSkeleton />;
  if (email.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{errorMessage(email.error)}</AlertDescription>
      </Alert>
    );
  }

  const data = email.data;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link to={["collections/[id]", data.collectionId]}>
              <ArrowLeftIcon />
              Back to the collection
            </Link>
          </Button>
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {data.subject || <em className="font-normal">(no subject)</em>}
          </h1>
        </div>

        {canAct ? (
          <div className="flex flex-wrap items-center gap-2">
            {data.state === "pending" ? (
              <Button disabled={approve.isPending} onClick={() => approve.mutate()}>
                <CheckIcon />
                {approve.isPending ? "Approving…" : "Approve"}
              </Button>
            ) : null}

            {data.state === "ready" ? (
              <Button disabled={send.isPending} onClick={() => send.mutate()}>
                <SendIcon />
                {send.isPending ? "Sending…" : "Send"}
              </Button>
            ) : null}

            {testAddresses.length ? (
              <div className="flex items-center gap-1.5">
                <Select value={chosenTestAddress} onValueChange={setTestAddressId}>
                  <SelectTrigger size="sm" className="w-52">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {testAddresses.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id}>
                        {entry.label ? `${entry.label} — ${entry.address}` : entry.address}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  disabled={testSend.isPending}
                  onClick={() => testSend.mutate()}
                >
                  <TestTubeIcon />
                  {testSend.isPending ? "Sending…" : "Send to me"}
                </Button>
              </div>
            ) : (
              // Unavailable until at least one test address exists (§2.5), so
              // the control points at where to add one.
              <Button asChild variant="outline">
                <Link to={["account"]}>
                  <TestTubeIcon />
                  Add a test address
                </Link>
              </Button>
            )}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        <Card className="h-fit">
          <CardContent>
            <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-x-3">
              <Fact label="State">
                <StateBadge state={data.state} />
              </Fact>
              <Fact label="Delivery">
                <DeliveryBadge status={data.deliveryStatus} />
              </Fact>
              <Fact label="From">
                <Addresses list={[data.from]} />
              </Fact>
              <Fact label="To">{data.to.map((entry) => entry.address).join(", ")}</Fact>
              {data.cc.length ? (
                <Fact label="Cc">{data.cc.map((entry) => entry.address).join(", ")}</Fact>
              ) : null}
              {data.bcc.length ? (
                <Fact label="Bcc">{data.bcc.map((entry) => entry.address).join(", ")}</Fact>
              ) : null}
              <Fact label="Received">
                <When at={data.createdAt} /> · over{" "}
                {data.source === "smtp" ? "SMTP" : "HTTP"}
              </Fact>
              <Fact label="Reviewed">
                <When at={data.reviewedAt} />
              </Fact>
              <Fact label="Sent">
                <When at={data.sentAt} />
              </Fact>
              <Fact label="Attempts">
                <span className="tnum">{data.attempts}</span>
              </Fact>
              {data.providerMessageId ? (
                <Fact label="Message id">
                  <code className="font-mono text-xs break-all">
                    {data.providerMessageId}
                  </code>
                </Fact>
              ) : null}
            </dl>

            {data.lastError ? (
              <Alert variant="destructive" className="mt-2">
                <AlertDescription>{data.lastError}</AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-4">
          {data.html ? (
            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle>HTML preview</CardTitle>
                <span className="text-muted-foreground text-xs">
                  rendered in an isolated frame
                </span>
              </CardHeader>
              <CardContent className="p-0">
                <iframe
                  title="Email preview"
                  // No allow-scripts and no allow-same-origin: an opaque origin
                  // that cannot touch the hub's session, storage or DOM (§5.5).
                  sandbox=""
                  referrerPolicy="no-referrer"
                  srcDoc={data.html}
                  className="min-h-96 w-full bg-white"
                />
              </CardContent>
            </Card>
          ) : null}

          {data.text ? (
            <Card>
              <CardHeader>
                <CardTitle>Text body</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="bg-muted max-h-96 overflow-auto rounded-md p-3 font-mono text-xs break-words whitespace-pre-wrap">
                  {data.text}
                </pre>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
