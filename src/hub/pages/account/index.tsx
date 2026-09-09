import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { InfoIcon, MailCheckIcon, PlusIcon, Trash2Icon, VenetianMaskIcon } from "lucide-react";
import { useState } from "react";

import fetchClients from "_/fetch";

import { Empty, PageHeading, PageSkeleton, When, errorMessage } from "~/components/domain";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
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

/**
 * The account page (§5.10).
 *
 * Both credential changes are two steps, and the page says out loud where the
 * code went and why: the address a code is sent to is precisely what it proves,
 * and that is worth stating rather than leaving the reader to infer.
 */

const useAccount = () =>
  useQuery({ queryKey: ["account"], queryFn: () => fetchClients.account.GET() });

/** The second step of both flows: enter the code that was emailed. */
const ConfirmStep = ({
  onConfirm,
  pending,
  error,
}: {
  onConfirm: (code: string) => void;
  pending: boolean;
  error: unknown;
}) => {
  const [code, setCode] = useState("");

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onConfirm(code);
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="code">Confirmation code</Label>
        <Input
          id="code"
          inputMode="numeric"
          placeholder="000000"
          value={code}
          required
          autoComplete="one-time-code"
          className="tnum w-40 font-mono tracking-widest"
          onChange={(event) => setCode(event.target.value)}
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Confirming…" : "Confirm"}
      </Button>
      {error ? (
        <p className="text-destructive w-full text-sm">{errorMessage(error)}</p>
      ) : null}
    </form>
  );
};

const ChangeEmail = ({ pending }: { pending: boolean }) => {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");

  const ask = useMutation({
    mutationFn: () => fetchClients["account/email"].POST([], { json: { email } }),
    onSuccess: (result) => {
      toast.success(`Code sent to ${result.sentTo}`);
      void queryClient.invalidateQueries({ queryKey: ["account"] });
    },
  });

  const confirm = useMutation({
    mutationFn: (code: string) =>
      fetchClients["account/email"].PUT([], { json: { code } }),
    onSuccess: (result) => {
      setEmail("");
      toast.success(`Your address is now ${result.email}`);
      void queryClient.invalidateQueries();
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change your email</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            ask.mutate();
          }}
        >
          <div className="min-w-56 flex-1 space-y-1.5">
            <Label htmlFor="new-email">New address</Label>
            <Input
              id="new-email"
              type="email"
              value={email}
              required
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <Button variant="outline" type="submit" disabled={ask.isPending}>
            {ask.isPending ? "Sending…" : "Send a code"}
          </Button>
        </form>

        <p className="text-muted-foreground text-xs">
          The code goes to the <strong>new</strong> address — that is what proves you
          control it. Until you enter it, your account keeps its current address.
        </p>

        {ask.error ? (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(ask.error)}</AlertDescription>
          </Alert>
        ) : null}

        {pending ? (
          <ConfirmStep
            onConfirm={(code) => confirm.mutate(code)}
            pending={confirm.isPending}
            error={confirm.error}
          />
        ) : null}
      </CardContent>
    </Card>
  );
};

const ChangePassword = ({ pending }: { pending: boolean }) => {
  const queryClient = useQueryClient();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const ask = useMutation({
    mutationFn: () =>
      fetchClients["account/password"].POST([], {
        json: { currentPassword, newPassword },
      }),
    onSuccess: (result) => {
      toast.success(`Code sent to ${result.sentTo}`);
      void queryClient.invalidateQueries({ queryKey: ["account"] });
    },
  });

  const confirm = useMutation({
    mutationFn: (code: string) =>
      fetchClients["account/password"].PUT([], { json: { code } }),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      toast.success("Password changed", {
        description: "Your other sessions were signed out.",
      });
      void queryClient.invalidateQueries();
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change your password</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            ask.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                required
                autoComplete="current-password"
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                required
                minLength={10}
                autoComplete="new-password"
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </div>
          </div>

          <Button variant="outline" type="submit" disabled={ask.isPending}>
            {ask.isPending ? "Sending…" : "Send a code"}
          </Button>
        </form>

        <p className="text-muted-foreground text-xs">
          The code goes to the address <strong>currently</strong> on your account — that
          is what proves the request is yours.
        </p>

        {ask.error ? (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(ask.error)}</AlertDescription>
          </Alert>
        ) : null}

        {pending ? (
          <ConfirmStep
            onConfirm={(code) => confirm.mutate(code)}
            pending={confirm.isPending}
            error={confirm.error}
          />
        ) : null}
      </CardContent>
    </Card>
  );
};

const TestAddresses = () => {
  const queryClient = useQueryClient();
  const account = useAccount();
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");

  const add = useMutation({
    mutationFn: () =>
      fetchClients["account/test-addresses"].POST([], {
        json: { address, ...(label ? { label } : {}) },
      }),
    onSuccess: () => {
      setAddress("");
      setLabel("");
      toast.success("Test address added");
      void queryClient.invalidateQueries({ queryKey: ["account"] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => fetchClients["account/test-addresses/[id]"].DELETE([id]),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["account"] }),
  });

  const list = account.data?.testAddresses ?? [];

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Test addresses</CardTitle>
        <span className="text-muted-foreground text-xs">newest first</span>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Where “Send to me” delivers a copy. They belong to this account rather than to
          any collection, so they stay put if your collections are ever reassigned.
        </p>

        {list.length === 0 ? (
          <Empty title="None yet">
            Add one to enable “Send to me” on the email view.
          </Empty>
        ) : (
          <div className="-mx-4 border-y">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Address</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">{entry.address}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.label ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      <When at={entry.createdAt} />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${entry.address}`}
                        onClick={() => remove.mutate(entry.id)}
                      >
                        <Trash2Icon />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            add.mutate();
          }}
        >
          <div className="min-w-52 flex-1 space-y-1.5">
            <Label htmlFor="test-address">Address</Label>
            <Input
              id="test-address"
              type="email"
              placeholder="you@example.com"
              value={address}
              required
              onChange={(event) => setAddress(event.target.value)}
            />
          </div>
          <div className="w-40 space-y-1.5">
            <Label htmlFor="test-label">Label</Label>
            <Input
              id="test-label"
              placeholder="optional"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
          <Button variant="outline" type="submit" disabled={add.isPending}>
            <PlusIcon />
            Add
          </Button>
        </form>

        {add.error ? (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(add.error)}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default function AccountPage() {
  const session = useSession();
  const account = useAccount();

  if (account.isPending) return <PageSkeleton />;
  if (account.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{errorMessage(account.error)}</AlertDescription>
      </Alert>
    );
  }

  const data = account.data;
  const impersonating = session.data?.actor?.impersonating === true;
  const isOperator = session.data?.actor?.identity.role === "operator";

  return (
    <>
      <PageHeading
        title="Your account"
        description={
          <span className="flex items-center gap-2">
            {data.email} <Badge variant="neutral">{data.role}</Badge>
          </span>
        }
      />

      <div className="max-w-3xl space-y-4">
        {data.pendingChange ? (
          <Alert variant="info">
            <MailCheckIcon />
            <AlertTitle>
              A {data.pendingChange.purpose} change is waiting for its code
            </AlertTitle>
            <AlertDescription>
              It was sent to <strong>{data.pendingChange.sentTo}</strong> and expires{" "}
              <When at={data.pendingChange.expiresAt} />.
            </AlertDescription>
          </Alert>
        ) : null}

        {impersonating ? (
          <Alert variant="warning">
            <VenetianMaskIcon />
            <AlertTitle>You are impersonating someone</AlertTitle>
            <AlertDescription>
              Credential changes are self-service by definition, so they would apply to
              your own account. End the impersonation first if that is not what you
              meant.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <ChangeEmail pending={data.pendingChange?.purpose === "email"} />
            <ChangePassword pending={data.pendingChange?.purpose === "password"} />
          </>
        )}

        {isOperator ? (
          <TestAddresses />
        ) : (
          <Alert>
            <InfoIcon />
            <AlertDescription>
              Test addresses belong to operators. Test sending is a write action, so it
              happens under impersonation, using that operator's own list.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </>
  );
}
