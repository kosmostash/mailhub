import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangleIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import fetchClients, { type ResponseT } from "_/fetch";

import { ConfirmDialog } from "~/components/ConfirmDialog";
import { Empty, PageHeading, PageSkeleton, errorMessage } from "~/components/domain";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
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
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Input, Textarea } from "~/components/ui/input";
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
import { Switch } from "~/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";

type ProviderT = ResponseT["providers"]["GET"]["providers"][number];
type ProviderTypeT = ResponseT["providers"]["GET"]["types"][number];
type ConfigT = Record<string, string | number | boolean | null>;

/**
 * Providers (§5.6) - the admin's own write domain.
 *
 * Two things the UI has to get right. Secrets come back masked and are never
 * sent back unchanged: leaving the password field empty keeps the stored one,
 * because an update merges over what is stored. And a type that is registered
 * but not implemented is offered anyway, marked as such - it configures fine
 * and fails a send loudly, which is the documented contract rather than an
 * oversight (§2.4).
 */

const SMTP_DEFAULTS: ConfigT = { host: "", port: 587, secure: false, user: "", pass: "" };

const SmtpFields = ({
  config,
  onChange,
  editing,
}: {
  config: ConfigT;
  onChange: (next: ConfigT) => void;
  editing: boolean;
}) => (
  <>
    <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
      <div className="space-y-1.5">
        <Label htmlFor="smtp-host">Host</Label>
        <Input
          id="smtp-host"
          value={String(config.host ?? "")}
          required
          onChange={(event) => onChange({ ...config, host: event.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="smtp-port">Port</Label>
        <Input
          id="smtp-port"
          type="number"
          min={1}
          max={65535}
          value={Number(config.port ?? 587)}
          onChange={(event) => onChange({ ...config, port: Number(event.target.value) })}
        />
      </div>
    </div>

    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="smtp-user">Username</Label>
        <Input
          id="smtp-user"
          value={String(config.user ?? "")}
          autoComplete="off"
          placeholder="optional"
          onChange={(event) => onChange({ ...config, user: event.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="smtp-pass">Password</Label>
        <Input
          id="smtp-pass"
          type="password"
          value={String(config.pass ?? "")}
          autoComplete="new-password"
          placeholder={editing ? "leave empty to keep" : ""}
          onChange={(event) => onChange({ ...config, pass: event.target.value })}
        />
      </div>
    </div>

    <div className="flex items-start gap-3 rounded-md border p-3">
      <Switch
        id="smtp-secure"
        checked={config.secure === true}
        onCheckedChange={(checked) => onChange({ ...config, secure: checked })}
      />
      <div className="space-y-0.5">
        <Label htmlFor="smtp-secure">Implicit TLS</Label>
        <p className="text-muted-foreground text-xs">
          For port 465. Leave off for STARTTLS on 587, or a plain relay on 25.
        </p>
      </div>
    </div>
  </>
);

const ProviderDialog = ({
  types,
  existing,
  open,
  onOpenChange,
}: {
  types: Array<ProviderTypeT>;
  existing?: ProviderT | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const queryClient = useQueryClient();
  const [name, setName] = useState(existing?.name ?? "");
  const [type, setType] = useState(existing?.type ?? "smtp");
  const [config, setConfig] = useState<ConfigT>(
    // The masked password is a placeholder, never a value to send back.
    existing ? { ...(existing.config as ConfigT), pass: "" } : SMTP_DEFAULTS,
  );

  const payload = () => {
    const cleaned: ConfigT = { ...config };
    // An update merges over what is stored, so an omitted key means
    // "unchanged": that is how an empty password field keeps the stored one.
    // Every other key is sent as typed - including an emptied username, which
    // is how auth gets removed.
    if (!cleaned.pass) delete cleaned.pass;
    return { name, type, config: cleaned };
  };

  const save = useMutation({
    mutationFn: () =>
      existing
        ? fetchClients["providers/[id]"].PUT([existing.id], { json: payload() })
        : fetchClients.providers.POST([], { json: payload() }),
    onSuccess: (provider) => {
      toast.success(existing ? `${provider.name} updated` : `${provider.name} created`);
      void queryClient.invalidateQueries();
      onOpenChange(false);
    },
  });

  const selected = types.find((entry) => entry.type === type);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? `Edit ${existing.name}` : "New provider"}</DialogTitle>
          <DialogDescription>
            Available to every one of your operators — by name and type only; they never
            see this configuration.
          </DialogDescription>
        </DialogHeader>

        <form
          id="provider-form"
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="provider-name">Name</Label>
              <Input
                id="provider-name"
                value={name}
                required
                autoFocus
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={type}
                onValueChange={(value) => {
                  setType(value);
                  setConfig(value === "smtp" ? SMTP_DEFAULTS : {});
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {types.map((entry) => (
                    <SelectItem key={entry.type} value={entry.type}>
                      {entry.label}
                      {entry.implemented ? "" : " — not implemented"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selected && !selected.implemented ? (
            <Alert variant="warning">
              <AlertTriangleIcon />
              <AlertTitle>Registered, but not implemented here</AlertTitle>
              <AlertDescription>
                It will configure and save. Any send through it fails with a clear error
                rather than dropping the email.
              </AlertDescription>
            </Alert>
          ) : null}

          {type === "smtp" ? (
            <SmtpFields config={config} onChange={setConfig} editing={Boolean(existing)} />
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="raw-config">Configuration (JSON)</Label>
              <Textarea
                id="raw-config"
                rows={5}
                className="font-mono text-xs"
                defaultValue={JSON.stringify(config, null, 2)}
                onChange={(event) => {
                  try {
                    setConfig(JSON.parse(event.target.value) as ConfigT);
                  } catch {
                    // Left to the server to reject: a half-typed object is not
                    // an error yet, and blocking every keystroke is unusable.
                  }
                }}
              />
            </div>
          )}

          {save.error ? (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage(save.error)}</AlertDescription>
            </Alert>
          ) : null}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="provider-form" disabled={save.isPending}>
            {save.isPending ? "Saving…" : existing ? "Save provider" : "Create provider"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default function ProvidersPage() {
  const session = useSession();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ProviderT | null>(null);
  const [deleting, setDeleting] = useState<ProviderT | null>(null);

  // Ending an impersonation takes this capability away while the page is still
  // mounted; asking anyway would just earn a 403 on the way out.
  const canManage = session.data?.actor?.capabilities.manageProviders === true;

  const providers = useQuery({
    queryKey: ["providers"],
    queryFn: () => fetchClients.providers.GET(),
    enabled: canManage,
  });

  const remove = useMutation({
    mutationFn: (id: string) => fetchClients["providers/[id]"].DELETE([id]),
    onSuccess: () => {
      toast.success("Provider deleted");
      setDeleting(null);
      void queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (!canManage || providers.isPending) return <PageSkeleton />;
  if (providers.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{errorMessage(providers.error)}</AlertDescription>
      </Alert>
    );
  }

  const list = providers.data.providers;

  return (
    <>
      <PageHeading
        title="Providers"
        description="How mail actually leaves. Every provider here is available to every one of your operators — by name and type only; they never see a configuration."
        actions={
          <Button onClick={() => setCreating(true)}>
            <PlusIcon />
            New provider
          </Button>
        }
      />

      <Card className="overflow-hidden">
        {list.length === 0 ? (
          <Empty
            title="No providers yet"
            action={
              <Button onClick={() => setCreating(true)}>
                <PlusIcon />
                New provider
              </Button>
            }
          >
            Until one exists, your operators' collections can receive and store mail but
            not send it.
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Configuration</TableHead>
                <TableHead>In use by</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>

            <TableBody>
              {list.map((provider) => (
                <TableRow key={provider.id}>
                  <TableCell className="font-medium">{provider.name}</TableCell>

                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span>{provider.type}</span>
                      {provider.implemented ? null : (
                        <Badge variant="bounced">not implemented</Badge>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="text-muted-foreground max-w-72 truncate font-mono text-xs">
                    {Object.entries(provider.config)
                      .map(([key, value]) => `${key}=${String(value)}`)
                      .join("  ")}
                  </TableCell>

                  <TableCell className="text-muted-foreground tnum text-xs whitespace-nowrap">
                    {provider.collections} collection
                    {provider.collections === 1 ? "" : "s"}
                  </TableCell>

                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Actions for ${provider.name}`}
                        >
                          <MoreHorizontalIcon />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing(provider)}>
                          <PencilIcon />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setDeleting(provider)}
                        >
                          <Trash2Icon />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {creating ? (
        <ProviderDialog
          types={providers.data.types}
          open
          onOpenChange={(open) => !open && setCreating(false)}
        />
      ) : null}

      {editing ? (
        // Keyed by id so the form state resets when a different row is opened.
        <ProviderDialog
          key={editing.id}
          types={providers.data.types}
          existing={editing}
          open
          onOpenChange={(open) => !open && setEditing(null)}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete “${deleting?.name}”?`}
        destructive
        confirmLabel="Delete provider"
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        body={
          deleting && deleting.collections > 0 ? (
            <Alert variant="warning">
              <AlertTriangleIcon />
              <AlertDescription>
                It is still assigned to {deleting.collections} collection
                {deleting.collections === 1 ? "" : "s"}, so this will be refused — clear
                it from them first, or those collections would silently stop sending.
              </AlertDescription>
            </Alert>
          ) : null
        }
      />
    </>
  );
}
