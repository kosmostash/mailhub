import { useState } from "react";

import { ErrorNotice, Field, Form } from "~/components/ui";
import { useBootstrap, useSession, useSignIn } from "~/hooks/session";

/**
 * Sign-in, and first-run bootstrap (§5.1, §2.1.4).
 *
 * One screen with two faces, chosen by the API rather than by a flag in the
 * browser: while no superadmin exists the app *proposes creating one*, and the
 * moment one exists this becomes an ordinary sign-in form and never goes back.
 */
export default function SignInPage() {
  const session = useSession();
  const signIn = useSignIn();
  const bootstrap = useBootstrap();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const firstRun = session.data?.needsBootstrap === true;
  const action = firstRun ? bootstrap : signIn;

  return (
    <div className="auth-card">
      <h1>{firstRun ? "Welcome to MailHub" : "Sign in"}</h1>
      <p className="muted">
        {firstRun
          ? "No superadmin exists yet. Create one to get started - it is the only account that can create admins, and there can never be a second."
          : "One hub for every project's outbound mail."}
      </p>

      <Form onSubmit={() => action.mutate({ email, password })}>
        <Field label="Email">
          <input
            type="email"
            value={email}
            autoComplete="username"
            required
            autoFocus
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        <Field label="Password">
          <input
            type="password"
            value={password}
            autoComplete={firstRun ? "new-password" : "current-password"}
            required
            minLength={firstRun ? 10 : 1}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>

        <ErrorNotice error={action.error} />

        <button type="submit" className="primary" disabled={action.isPending}>
          {action.isPending
            ? "Working…"
            : firstRun
              ? "Create the superadmin"
              : "Sign in"}
        </button>

        {firstRun ? (
          <p className="faint">
            Passwords are at least 10 characters. Changing this account's email or
            password later needs a code sent by email, like every other account.
          </p>
        ) : null}
      </Form>
    </div>
  );
}
