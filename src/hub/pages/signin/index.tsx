import { SendIcon } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { errorMessage } from "~/components/domain";
import { useBootstrap, useSession, useSignIn } from "~/hooks/session";

/**
 * Sign-in, and first-run bootstrap (§5.1, §2.1.4).
 *
 * One screen with two faces, and which one you get is the API's call rather
 * than a flag in the browser: while no superadmin exists the app proposes
 * creating one, and the moment one exists this becomes an ordinary sign-in
 * form and never goes back.
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
    <Card className="w-full max-w-sm">
      <CardContent className="p-6">
        <div className="mb-6 space-y-2">
          <div className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg">
            <SendIcon className="size-4.5" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">
            {firstRun ? "Welcome to MailHub" : "Sign in to MailHub"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {firstRun
              ? "No superadmin exists yet. Create one to get started — it is the only account that can create admins, and there can never be a second."
              : "One hub for every project's outbound mail."}
          </p>
        </div>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            action.mutate({ email, password });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              autoComplete="username"
              required
              autoFocus
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              autoComplete={firstRun ? "new-password" : "current-password"}
              required
              minLength={firstRun ? 10 : 1}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {action.error ? (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage(action.error)}</AlertDescription>
            </Alert>
          ) : null}

          <Button type="submit" className="w-full" disabled={action.isPending}>
            {action.isPending
              ? "Working…"
              : firstRun
                ? "Create the superadmin"
                : "Sign in"}
          </Button>

          {firstRun ? (
            <p className="text-muted-foreground text-xs">
              Passwords are at least 10 characters. Changing this account's email or
              password later needs a code sent by email, like every other account.
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
