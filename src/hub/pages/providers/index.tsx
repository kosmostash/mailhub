import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import fetchClients, { type ResponseT } from "_/fetch";

import { Empty, ErrorNotice, Field, Form, Notice, Splash } from "~/components/ui";

type ProviderT = ResponseT["providers"]["GET"]["providers"][number];
type ProviderTypeT = ResponseT["providers"]["GET"]["types"][number];

/**
 * Providers (§5.6) - the admin's own write domain.
 *
 * Two things the UI has to get right here. Secrets come back masked and are
 * never sent back unchanged: leaving the password field empty keeps the stored
 * one. And a type that is registered but not implemented is offered anyway,
 * marked as such - it configures fine and fails a send loudly, which is the
 * documented contract rather than an oversight (§2.4).
 */

type ConfigT = Record<string, string | number | boolean | null>;

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
    <div className="form-grid">
      <Field label="Host">
        <input
          value={String(config.host ?? "")}
          required
          onChange={(event) => onChange({ ...config, host: event.target.value })}
        />
      </Field>

      <Field label="Port">
        <input
          type="number"
          min={1}
          max={65535}
          value={Number(config.port ?? 587)}
          onChange={(event) => onChange({ ...config, port: Number(event.target.value) })}
        />
      </Field>
    </div>

    <div className="form-grid">
      <Field label="Username (optional)">
        <input
          value={String(config.user ?? "")}
          autoComplete="off"
          onChange={(event) => onChange({ ...config, user: event.target.value })}
        />
      </Field>

      <Field label={editing ? "Password (leave empty to keep)" : "Password"}>
        <input
          type="password"
          value={String(config.pass ?? "")}
          autoComplete="new-password"
          onChange={(event) => onChange({ ...config, pass: event.target.value })}
        />
      </Field>
    </div>

    <label className="check">
      <input
        type="checkbox"
        checked={config.secure === true}
        onChange={(event) => onChange({ ...config, secure: event.target.checked })}
      />
      Implicit TLS (port 465). Leave off for STARTTLS on 587 or a plain relay on 25.
    </label>
  </>
);

const GenericFields = ({
  config,
  onChange,
}: {
  config: ConfigT;
  onChange: (next: ConfigT) => void;
}) => (
  <Field label="Configuration (JSON)">
    <textarea
      rows={5}
      className="mono"
      defaultValue={JSON.stringify(config, null, 2)}
      onChange={(event) => {
        try {
          onChange(JSON.parse(event.target.value) as ConfigT);
        } catch {
          // Left to the server to reject: a half-typed object is not an error
          // yet, and blocking every keystroke would be unusable.
        }
      }}
    />
  </Field>
);

const ProviderForm = ({
  types,
  existing,
  onDone,
}: {
  types: Array<ProviderTypeT>;
  existing?: ProviderT;
  onDone: () => void;
}) => {
  const queryClient = useQueryClient();
  const [name, setName] = useState(existing?.name ?? "");
  const [type, setType] = useState(existing?.type ?? "smtp");
  const [config, setConfig] = useState<ConfigT>(
    existing
      ? // The masked password is a placeholder, never a value to send back.
        { ...(existing.config as ConfigT), pass: "" }
      : SMTP_DEFAULTS,
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
    onSuccess: () => {
      void queryClient.invalidateQueries();
      onDone();
    },
  });

  const selected = types.find((entry) => entry.type === type);

  return (
    <div className="card stack">
      <div className="card-head">
        <h3>{existing ? `Edit ${existing.name}` : "New provider"}</h3>
        <button type="button" className="quiet small" onClick={onDone}>
          cancel
        </button>
      </div>

      <Form onSubmit={() => save.mutate()} className="stack">
        <div className="form-grid">
          <Field label="Name">
            <input
              value={name}
              required
              autoFocus
              onChange={(event) => setName(event.target.value)}
            />
          </Field>

          <Field label="Type">
            <select
              value={type}
              onChange={(event) => {
                setType(event.target.value);
                setConfig(event.target.value === "smtp" ? SMTP_DEFAULTS : {});
              }}
            >
              {types.map((entry) => (
                <option key={entry.type} value={entry.type}>
                  {entry.label}
                  {entry.implemented ? "" : " — not implemented"}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {selected && !selected.implemented ? (
          <Notice kind="error">
            This type is registered but not implemented in this installation. It will
            configure and save, and any send through it will fail with a clear error
            rather than dropping the email.
          </Notice>
        ) : null}

        {type === "smtp" ? (
          <SmtpFields config={config} onChange={setConfig} editing={Boolean(existing)} />
        ) : (
          <GenericFields config={config} onChange={setConfig} />
        )}

        <ErrorNotice error={save.error} />

        <button type="submit" className="primary" disabled={save.isPending}>
          {save.isPending ? "Saving…" : existing ? "Save provider" : "Create provider"}
        </button>
      </Form>
    </div>
  );
};

export default function ProvidersPage() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ProviderT | null>(null);

  const providers = useQuery({
    queryKey: ["providers"],
    queryFn: () => fetchClients.providers.GET(),
  });

  const remove = useMutation({
    mutationFn: (id: string) => fetchClients["providers/[id]"].DELETE([id]),
    onSuccess: () => void queryClient.invalidateQueries(),
  });

  if (providers.isPending) return <Splash />;
  if (providers.error) return <ErrorNotice error={providers.error} />;

  const list = providers.data.providers;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Providers</h1>
          <p>
            How mail actually leaves. Every provider here is available to every one of
            your operators - by name and type only; they never see a configuration.
          </p>
        </div>
        {!creating && !editing ? (
          <button type="button" className="primary" onClick={() => setCreating(true)}>
            New provider
          </button>
        ) : null}
      </div>

      <div className="stack">
        {creating ? (
          <ProviderForm types={providers.data.types} onDone={() => setCreating(false)} />
        ) : null}

        {editing ? (
          <ProviderForm
            types={providers.data.types}
            existing={editing}
            onDone={() => setEditing(null)}
          />
        ) : null}

        <ErrorNotice error={remove.error} />

        {list.length === 0 ? (
          <Empty title="No providers yet">
            Until one exists, your operators' collections can receive and store mail but
            not send it.
          </Empty>
        ) : (
          <section className="panel">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Configuration</th>
                    <th>In use by</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.map((provider) => (
                    <tr key={provider.id}>
                      <td>
                        <strong>{provider.name}</strong>
                      </td>
                      <td className="shrink">
                        {provider.type}
                        {provider.implemented ? null : (
                          <span className="badge bounced" style={{ marginLeft: ".4rem" }}>
                            not implemented
                          </span>
                        )}
                      </td>
                      <td className="mono faint">
                        {Object.entries(provider.config)
                          .map(([key, value]) => `${key}=${String(value)}`)
                          .join("  ")}
                      </td>
                      <td className="shrink">
                        {provider.collections} collection
                        {provider.collections === 1 ? "" : "s"}
                      </td>
                      <td className="shrink">
                        <div className="row">
                          <button
                            type="button"
                            className="small"
                            onClick={() => {
                              setCreating(false);
                              setEditing(provider);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="small danger"
                            disabled={remove.isPending}
                            title={
                              provider.collections
                                ? "Still assigned to a collection"
                                : "Delete this provider"
                            }
                            onClick={() => {
                              if (window.confirm(`Delete provider "${provider.name}"?`)) {
                                remove.mutate(provider.id);
                              }
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
