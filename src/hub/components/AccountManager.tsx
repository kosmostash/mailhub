import {
  BanIcon,
  CircleCheckIcon,
  KeyRoundIcon,
  MoreHorizontalIcon,
  PlusIcon,
  Trash2Icon,
  UserPlusIcon,
  VenetianMaskIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";

import { ConfirmDialog } from "~/components/ConfirmDialog";
import { Empty, PageHeading, When, errorMessage } from "~/components/domain";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";

/**
 * The operators page and the admins page, one component.
 *
 * That is not code-golf: §2.1.5 and §2.1.6 describe the two levels as the same
 * workflow one step apart - "only the blast radius differs" - and building them
 * from one piece is how the UI keeps that promise. Disable, reassign, delete
 * and reset behave identically at both levels; a page supplies the wording, the
 * per-row counts, and the five calls.
 */

export type ManagedAccountT = {
  id: string;
  email: string;
  disabled: boolean;
  deletable: boolean;
  lastActivityAt: string | null;
  /** What this account holds - shown per row, and what blocks deletion. */
  holdings: Array<{ label: string; value: number }>;
};

export type AccountManagerProps = {
  title: string;
  description: ReactNode;
  /** Singular noun: "operator", "admin". */
  noun: string;
  accounts: Array<ManagedAccountT>;
  /** What disabling this level stops, spelled out in the confirmation. */
  disableWarning: (account: ManagedAccountT) => ReactNode;
  onCreate: (input: { email: string; password: string }) => Promise<unknown>;
  onSetDisabled: (id: string, disabled: boolean) => Promise<unknown>;
  onResetPassword: (id: string, password: string) => Promise<unknown>;
  onReassign: (id: string, targetId: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  /** Absent where impersonation does not apply. */
  onImpersonate?: (id: string) => void;
  error?: unknown;
};

const CreateDialog = ({
  noun,
  open,
  onOpenChange,
  onCreate,
}: {
  noun: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: AccountManagerProps["onCreate"];
}) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New {noun}</DialogTitle>
          <DialogDescription>
            Hand the password over out of band — there is no invitation email, and they
            can change it themselves afterwards.
          </DialogDescription>
        </DialogHeader>

        <form
          id="create-account"
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            onCreate({ email, password })
              .then(() => {
                setEmail("");
                setPassword("");
                onOpenChange(false);
                toast.success(`${noun[0]!.toUpperCase()}${noun.slice(1)} created`);
              })
              .catch(setError)
              .finally(() => setBusy(false));
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="new-email">Email</Label>
            <Input
              id="new-email"
              type="email"
              value={email}
              required
              autoFocus
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-password">Initial password</Label>
            <Input
              id="new-password"
              type="text"
              value={password}
              required
              minLength={10}
              autoComplete="off"
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage(error)}</AlertDescription>
            </Alert>
          ) : null}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="create-account" disabled={busy}>
            {busy ? "Creating…" : `Create ${noun}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** An administrative reset (§2.1.1/§2.1.2) - deliberately not the §2.1.7 gate. */
const ResetPasswordDialog = ({
  account,
  onOpenChange,
  onResetPassword,
}: {
  account: ManagedAccountT | null;
  onOpenChange: (open: boolean) => void;
  onResetPassword: AccountManagerProps["onResetPassword"];
}) => {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open={account !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            For {account?.email}. This is an administrative reset — the recovery path
            for an account that cannot complete the emailed confirmation code. It signs
            them out everywhere.
          </DialogDescription>
        </DialogHeader>

        <form
          id="reset-password"
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!account) return;
            setBusy(true);
            setError(null);
            onResetPassword(account.id, password)
              .then(() => {
                setPassword("");
                onOpenChange(false);
                toast.success(`Password reset for ${account.email}`);
              })
              .catch(setError)
              .finally(() => setBusy(false));
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="reset-value">New password</Label>
            <Input
              id="reset-value"
              type="text"
              value={password}
              required
              minLength={10}
              autoFocus
              autoComplete="off"
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage(error)}</AlertDescription>
            </Alert>
          ) : null}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="reset-password" disabled={busy}>
            {busy ? "Resetting…" : "Reset password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default function AccountManager(props: AccountManagerProps) {
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<ManagedAccountT | null>(null);
  const [disabling, setDisabling] = useState<ManagedAccountT | null>(null);
  const [deleting, setDeleting] = useState<ManagedAccountT | null>(null);
  const [reassigning, setReassigning] = useState<ManagedAccountT | null>(null);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);

  const run = (work: Promise<unknown>, done: string, after: () => void) => {
    setBusy(true);
    setFailure(null);
    work
      .then(() => {
        toast.success(done);
        after();
      })
      .catch((error: unknown) => {
        setFailure(error);
        toast.error(errorMessage(error));
      })
      .finally(() => setBusy(false));
  };

  const activeOthers = (account: ManagedAccountT) =>
    props.accounts.filter((candidate) => !candidate.disabled && candidate.id !== account.id);

  return (
    <>
      <PageHeading
        title={props.title}
        description={props.description}
        actions={
          <Button onClick={() => setCreating(true)}>
            <UserPlusIcon />
            New {props.noun}
          </Button>
        }
      />

      <div className="space-y-4">
        {failure || props.error ? (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(failure ?? props.error)}</AlertDescription>
          </Alert>
        ) : null}

        <Card className="overflow-hidden">
          {props.accounts.length === 0 ? (
            <Empty
              title={`No ${props.noun}s yet`}
              action={
                <Button onClick={() => setCreating(true)}>
                  <PlusIcon />
                  New {props.noun}
                </Button>
              }
            >
              Create one to get started — there is no self-registration.
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{props.noun}</TableHead>
                  <TableHead>Holds</TableHead>
                  <TableHead>Last activity</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>

              <TableBody>
                {props.accounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{account.email}</span>
                        {account.disabled ? (
                          <Badge variant="destructive">disabled</Badge>
                        ) : null}
                      </div>
                    </TableCell>

                    <TableCell className="text-muted-foreground text-xs">
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                        {account.holdings.map(({ label, value }) => (
                          <span key={label} className="tnum">
                            {value} {label}
                          </span>
                        ))}
                      </div>
                    </TableCell>

                    <TableCell className="text-muted-foreground text-xs">
                      <When at={account.lastActivityAt} />
                    </TableCell>

                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Actions for ${account.email}`}
                          >
                            <MoreHorizontalIcon />
                          </Button>
                        </DropdownMenuTrigger>

                        <DropdownMenuContent align="end">
                          {props.onImpersonate && !account.disabled ? (
                            <>
                              <DropdownMenuItem
                                onSelect={() => props.onImpersonate?.(account.id)}
                              >
                                <VenetianMaskIcon />
                                Impersonate
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          ) : null}

                          <DropdownMenuItem onSelect={() => setResetting(account)}>
                            <KeyRoundIcon />
                            Reset password
                          </DropdownMenuItem>

                          {account.disabled ? (
                            <DropdownMenuItem
                              onSelect={() =>
                                run(
                                  props.onSetDisabled(account.id, false),
                                  `${account.email} is active again — held mail resumes`,
                                  () => undefined,
                                )
                              }
                            >
                              <CircleCheckIcon />
                              Re-enable
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() => setDisabling(account)}
                            >
                              <BanIcon />
                              Disable
                            </DropdownMenuItem>
                          )}

                          {account.disabled &&
                          account.holdings.some(({ value }) => value > 0) ? (
                            <DropdownMenuItem
                              onSelect={() => {
                                setTarget("");
                                setReassigning(account);
                              }}
                            >
                              <UserPlusIcon />
                              Reassign what it holds
                            </DropdownMenuItem>
                          ) : null}

                          {account.deletable ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onSelect={() => setDeleting(account)}
                              >
                                <Trash2Icon />
                                Delete
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <CreateDialog
        noun={props.noun}
        open={creating}
        onOpenChange={setCreating}
        onCreate={props.onCreate}
      />

      <ResetPasswordDialog
        account={resetting}
        onOpenChange={(open) => !open && setResetting(null)}
        onResetPassword={props.onResetPassword}
      />

      <ConfirmDialog
        open={disabling !== null}
        onOpenChange={(open) => !open && setDisabling(null)}
        title={`Disable ${disabling?.email}?`}
        destructive
        confirmLabel="Disable"
        pending={busy}
        body={
          disabling ? (
            <Alert variant="warning">
              <AlertDescription>{props.disableWarning(disabling)}</AlertDescription>
            </Alert>
          ) : null
        }
        onConfirm={() =>
          disabling &&
          run(props.onSetDisabled(disabling.id, true), `${disabling.email} is disabled`, () =>
            setDisabling(null),
          )
        }
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.email}?`}
        description="Their activity trail stays, naming them as they were."
        destructive
        confirmLabel={`Delete ${props.noun}`}
        typeToConfirm={deleting?.email}
        pending={busy}
        onConfirm={() =>
          deleting &&
          run(props.onDelete(deleting.id), `${deleting.email} deleted`, () =>
            setDeleting(null),
          )
        }
      />

      <Dialog
        open={reassigning !== null}
        onOpenChange={(open) => !open && setReassigning(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reassign {reassigning?.email}</DialogTitle>
            <DialogDescription>
              Everything this {props.noun} still holds moves to an active one. Collection
              ids do not change, so projects submitting with them keep working, and the
              mail they were holding resumes under the new owner.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label>Move to</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger>
                <SelectValue placeholder={`Choose an active ${props.noun}…`} />
              </SelectTrigger>
              <SelectContent>
                {reassigning
                  ? activeOthers(reassigning).map((candidate) => (
                      <SelectItem key={candidate.id} value={candidate.id}>
                        {candidate.email}
                      </SelectItem>
                    ))
                  : null}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReassigning(null)}>
              Cancel
            </Button>
            <Button
              disabled={!target || busy}
              onClick={() =>
                reassigning &&
                run(
                  props.onReassign(reassigning.id, target),
                  `Moved everything to the chosen ${props.noun}`,
                  () => setReassigning(null),
                )
              }
            >
              Reassign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
