import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import fetchClients from "_/fetch";

import {
  Empty,
  ErrorNotice,
  Field,
  Form,
  Notice,
  Panel,
  Splash,
  When,
} from "~/components/ui";
import { useSession } from "~/hooks/session";

/**
 * The account page (§5.10).
 *
 * Both credential changes are two steps, and the page says out loud where the
 * code went and why - the address a code is sent to is what it proves, and
 * that is worth being explicit about rather than leaving to the user to infer.
 */

const useAccount = () =>
  useQuery({ queryKey: ["account"], queryFn: () => fetchClients.account.GET() });

const ChangeEmail = ({ pending }: { pending: boolean }) => {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");

  const ask = useMutation({
    mutationFn: () => fetchClients["account/email"].POST([], { json: { email } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["account"] }),
  });

  const confirm = useMutation({
    mutationFn: () => fetchClients["account/email"].PUT([], { json: { code } }),
    onSuccess: () => {
      setCode("");
      setEmail("");
      void queryClient.invalidateQueries();
    },
  });

  return (
    <Panel title="Change your email">
      <div className="body stack">
        <Form className="stack" onSubmit={() => ask.mutate()}>
          <Field label="New address">
            <input
              type="email"
              value={email}
              required
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <ErrorNotice error={ask.error} />
          <div className="row">
            <button type="submit" disabled={ask.isPending}>
              {ask.isPending ? "Sending…" : "Send a confirmation code"}
            </button>
            <span className="faint">
              The code goes to the <strong>new</strong> address - that is what proves you
              control it. Until you enter it, your account keeps its current address.
            </span>
          </div>
        </Form>

        {pending ? (
          <Form className="row" onSubmit={() => confirm.mutate()}>
            <input
              inputMode="numeric"
              placeholder="6-digit code"
              value={code}
              required
              onChange={(event) => setCode(event.target.value)}
              style={{ width: "12rem" }}
            />
            <button type="submit" className="primary" disabled={confirm.isPending}>
              Confirm the change
            </button>
            <ErrorNotice error={confirm.error} />
          </Form>
        ) : null}
      </div>
    </Panel>
  );
};

const ChangePassword = ({ pending }: { pending: boolean }) => {
  const queryClient = useQueryClient();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [code, setCode] = useState("");
  const [done, setDone] = useState(false);

  const ask = useMutation({
    mutationFn: () =>
      fetchClients["account/password"].POST([], { json: { currentPassword, newPassword } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["account"] }),
  });

  const confirm = useMutation({
    mutationFn: () => fetchClients["account/password"].PUT([], { json: { code } }),
    onSuccess: () => {
      setDone(true);
      setCode("");
      setCurrentPassword("");
      setNewPassword("");
      void queryClient.invalidateQueries();
    },
  });

  return (
    <Panel title="Change your password">
      <div className="body stack">
        {done ? <Notice kind="ok">Password changed. Other sessions were signed out.</Notice> : null}

        <Form className="stack" onSubmit={() => ask.mutate()}>
          <div className="form-grid">
            <Field label="Current password">
              <input
                type="password"
                value={currentPassword}
                required
                autoComplete="current-password"
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </Field>
            <Field label="New password">
              <input
                type="password"
                value={newPassword}
                required
                minLength={10}
                autoComplete="new-password"
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </Field>
          </div>
          <ErrorNotice error={ask.error} />
          <div className="row">
            <button type="submit" disabled={ask.isPending}>
              {ask.isPending ? "Sending…" : "Send a confirmation code"}
            </button>
            <span className="faint">
              The code goes to the address <strong>currently</strong> on your account - that
              is what proves the request is yours.
            </span>
          </div>
        </Form>

        {pending ? (
          <Form className="row" onSubmit={() => confirm.mutate()}>
            <input
              inputMode="numeric"
              placeholder="6-digit code"
              value={code}
              required
              onChange={(event) => setCode(event.target.value)}
              style={{ width: "12rem" }}
            />
            <button type="submit" className="primary" disabled={confirm.isPending}>
              Confirm the change
            </button>
            <ErrorNotice error={confirm.error} />
          </Form>
        ) : null}
      </div>
    </Panel>
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
      void queryClient.invalidateQueries({ queryKey: ["account"] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => fetchClients["account/test-addresses/[id]"].DELETE([id]),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["account"] }),
  });

  const list = account.data?.testAddresses ?? [];

  return (
    <Panel title="Test addresses">
      <div className="body stack">
        <p className="muted" style={{ margin: 0 }}>
          Where “Send to me” delivers a copy. They belong to this account rather than to
          any collection, so they stay put if your collections are ever reassigned.
        </p>

        {list.length === 0 ? (
          <Empty title="None yet">Add one to enable “Send to me” on the email view.</Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Address</th>
                  <th>Label</th>
                  <th>Added</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.address}</td>
                    <td className="faint">{entry.label ?? "–"}</td>
                    <td className="shrink faint">
                      <When at={entry.createdAt} />
                    </td>
                    <td className="shrink">
                      <button
                        type="button"
                        className="small quiet"
                        onClick={() => remove.mutate(entry.id)}
                      >
                        remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Form className="row" onSubmit={() => add.mutate()}>
          <input
            type="email"
            placeholder="you@example.com"
            value={address}
            required
            onChange={(event) => setAddress(event.target.value)}
            style={{ width: "18rem" }}
          />
          <input
            placeholder="label (optional)"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            style={{ width: "12rem" }}
          />
          <button type="submit" disabled={add.isPending}>
            Add
          </button>
        </Form>
        <ErrorNotice error={add.error} />
      </div>
    </Panel>
  );
};

export default function AccountPage() {
  const session = useSession();
  const account = useAccount();

  if (account.isPending) return <Splash />;
  if (account.error) return <ErrorNotice error={account.error} />;

  const data = account.data;
  const impersonating = session.data?.actor?.impersonating === true;
  const isOperator = session.data?.actor?.identity.role === "operator";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Your account</h1>
          <p>
            {data.email} · {data.role}
          </p>
        </div>
      </div>

      <div className="stack">
        {data.pendingChange ? (
          <Notice kind="info">
            A {data.pendingChange.purpose} change is waiting for its code. It was sent to{" "}
            <strong>{data.pendingChange.sentTo}</strong> and expires{" "}
            <When at={data.pendingChange.expiresAt} />.
          </Notice>
        ) : null}

        {impersonating ? (
          <Notice kind="info">
            You are impersonating someone. Credential changes are self-service by
            definition, so they apply to your own account only - end the impersonation
            first if that is not what you meant.
          </Notice>
        ) : (
          <>
            <ChangeEmail pending={data.pendingChange?.purpose === "email"} />
            <ChangePassword pending={data.pendingChange?.purpose === "password"} />
          </>
        )}

        {isOperator ? <TestAddresses /> : null}
      </div>
    </>
  );
}
