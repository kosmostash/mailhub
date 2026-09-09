import { useState, type ReactNode } from "react";

import { Empty, ErrorNotice, Field, Form, Notice, When } from "~/components/ui";

/**
 * The operators page and the admins page, one component.
 *
 * That is not code-golf: §2.1.5 and §2.1.6 describe the two levels as the same
 * workflow one step apart - "only the blast radius differs" - and building
 * them from one piece is how the UI keeps that promise. Disable, reassign,
 * delete and reset behave identically at both levels; what a page supplies is
 * the wording, the per-row counts, and the four calls.
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
  disableWarning: (account: ManagedAccountT) => string;
  onCreate: (input: { email: string; password: string }) => Promise<unknown>;
  onSetDisabled: (id: string, disabled: boolean) => Promise<unknown>;
  onResetPassword: (id: string, password: string) => Promise<unknown>;
  onReassign: (id: string, targetId: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  /** Absent where impersonation does not apply. */
  onImpersonate?: (id: string) => void;
  busy?: boolean;
  error?: unknown;
};

const CreateForm = ({
  noun,
  onCreate,
  onDone,
}: {
  noun: string;
  onCreate: AccountManagerProps["onCreate"];
  onDone: () => void;
}) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="card">
      <div className="card-head">
        <h3>New {noun}</h3>
        <button type="button" className="quiet small" onClick={onDone}>
          cancel
        </button>
      </div>

      <Form
        className="stack"
        onSubmit={() => {
          setBusy(true);
          setError(null);
          onCreate({ email, password })
            .then(() => {
              setEmail("");
              setPassword("");
              onDone();
            })
            .catch(setError)
            .finally(() => setBusy(false));
        }}
      >
        <div className="form-grid">
          <Field label="Email">
            <input
              type="email"
              value={email}
              required
              autoFocus
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>

          <Field label="Initial password">
            <input
              type="text"
              value={password}
              required
              minLength={10}
              autoComplete="off"
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
        </div>

        <ErrorNotice error={error} />

        <div className="row">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "Creating…" : `Create ${noun}`}
          </button>
          <span className="faint">
            Hand the password over out of band - there is no invitation email, and
            they can change it themselves afterwards.
          </span>
        </div>
      </Form>
    </div>
  );
};

export default function AccountManager(props: AccountManagerProps) {
  const [creating, setCreating] = useState(false);
  const [reassigning, setReassigning] = useState<ManagedAccountT | null>(null);
  const [target, setTarget] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  const run = (work: Promise<unknown>, done: string) => {
    setFailure(null);
    work.then(() => setNotice(done)).catch(setFailure);
  };

  const activeOthers = (account: ManagedAccountT) =>
    props.accounts.filter((candidate) => !candidate.disabled && candidate.id !== account.id);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{props.title}</h1>
          <p>{props.description}</p>
        </div>
        {!creating ? (
          <button type="button" className="primary" onClick={() => setCreating(true)}>
            New {props.noun}
          </button>
        ) : null}
      </div>

      <div className="stack">
        {creating ? (
          <CreateForm
            noun={props.noun}
            onCreate={props.onCreate}
            onDone={() => setCreating(false)}
          />
        ) : null}

        {notice ? <Notice kind="ok">{notice}</Notice> : null}
        <ErrorNotice error={failure ?? props.error} />

        {reassigning ? (
          <div className="card stack">
            <div className="card-head">
              <h3>Reassign {reassigning.email}</h3>
              <button
                type="button"
                className="quiet small"
                onClick={() => setReassigning(null)}
              >
                cancel
              </button>
            </div>

            <p className="muted" style={{ margin: 0 }}>
              Everything this {props.noun} still holds moves to an active one. Collection
              ids do not change, so projects submitting with them keep working, and the
              mail they were holding resumes under the new owner.
            </p>

            <Form
              className="row"
              onSubmit={() => {
                run(
                  props.onReassign(reassigning.id, target).then(() => setReassigning(null)),
                  `Moved everything to the chosen ${props.noun}.`,
                );
              }}
            >
              <select
                value={target}
                required
                onChange={(event) => setTarget(event.target.value)}
                style={{ width: "auto", minWidth: "16rem" }}
              >
                <option value="">choose an active {props.noun}…</option>
                {activeOthers(reassigning).map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.email}
                  </option>
                ))}
              </select>
              <button type="submit" className="primary" disabled={!target}>
                Reassign
              </button>
            </Form>
          </div>
        ) : null}

        {props.accounts.length === 0 ? (
          <Empty title={`No ${props.noun}s yet`}>
            Create one to get started - there is no self-registration.
          </Empty>
        ) : (
          <section className="panel">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{props.noun}</th>
                    <th>Holds</th>
                    <th>Last activity</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {props.accounts.map((account) => (
                    <tr key={account.id}>
                      <td>
                        <strong>{account.email}</strong>{" "}
                        {account.disabled ? (
                          <span className="badge disabled">disabled</span>
                        ) : null}
                      </td>

                      <td className="faint">
                        {account.holdings
                          .map(({ label, value }) => `${value} ${label}`)
                          .join(" · ")}
                      </td>

                      <td className="shrink faint">
                        <When at={account.lastActivityAt} />
                      </td>

                      <td className="shrink">
                        <div className="row">
                          {props.onImpersonate && !account.disabled ? (
                            <button
                              type="button"
                              className="small"
                              onClick={() => props.onImpersonate?.(account.id)}
                            >
                              Impersonate
                            </button>
                          ) : null}

                          <button
                            type="button"
                            className="small"
                            onClick={() => {
                              const password = window.prompt(
                                `New password for ${account.email} (at least 10 characters).\n\n` +
                                  "This is an administrative reset - it signs them out and does " +
                                  "not go through the emailed confirmation code.",
                              );
                              if (password) {
                                run(
                                  props.onResetPassword(account.id, password),
                                  `Password reset for ${account.email}.`,
                                );
                              }
                            }}
                          >
                            Reset password
                          </button>

                          <button
                            type="button"
                            className={`small${account.disabled ? "" : " danger"}`}
                            onClick={() => {
                              if (account.disabled) {
                                run(
                                  props.onSetDisabled(account.id, false),
                                  `${account.email} is active again - held mail resumes.`,
                                );
                                return;
                              }
                              if (window.confirm(props.disableWarning(account))) {
                                run(
                                  props.onSetDisabled(account.id, true),
                                  `${account.email} is disabled.`,
                                );
                              }
                            }}
                          >
                            {account.disabled ? "Re-enable" : "Disable"}
                          </button>

                          {account.disabled &&
                          account.holdings.some(({ value }) => value > 0) ? (
                            <button
                              type="button"
                              className="small"
                              onClick={() => {
                                setTarget("");
                                setReassigning(account);
                              }}
                            >
                              Reassign
                            </button>
                          ) : null}

                          {account.deletable ? (
                            <button
                              type="button"
                              className="small danger"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Delete ${account.email}? Their activity trail stays, naming them as they were.`,
                                  )
                                ) {
                                  run(
                                    props.onDelete(account.id),
                                    `${account.email} deleted.`,
                                  );
                                }
                              }}
                            >
                              Delete
                            </button>
                          ) : null}
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
