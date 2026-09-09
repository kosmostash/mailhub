import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { useEffect } from "react";

import Link from "~/components/Link";
import { Splash } from "~/components/ui";
import {
  type ActorT,
  useEndImpersonation,
  useSession,
  useSignOut,
} from "~/hooks/session";

/**
 * The application shell.
 *
 * It owns two things the pages should never have to think about: whether there
 * is a session at all, and - when the session is standing in someone else's
 * shoes - saying so, unmistakably and on every screen (§2.2).
 */

const NAV: Array<{ to: string; label: string; when: (actor: ActorT) => boolean }> = [
  { to: "/", label: "Dashboard", when: () => true },
  {
    to: "/providers",
    label: "Providers",
    when: (actor) => actor.capabilities.manageProviders,
  },
  {
    to: "/operators",
    label: "Operators",
    when: (actor) => actor.capabilities.manageOperators,
  },
  {
    to: "/admins",
    label: "Admins",
    when: (actor) => actor.capabilities.manageAdmins,
  },
  // Operators may be shown their own trail; they never see anyone else's, and
  // the endpoint scopes it for them (§2.6).
  { to: "/activity", label: "Activity", when: () => true },
];

const ImpersonationBanner = ({ actor }: { actor: ActorT }) => {
  const end = useEndImpersonation();
  const navigate = useNavigate();

  return (
    <div className="impersonating" role="status">
      <span>
        Acting as <strong>{actor.identity.email}</strong> ({actor.identity.role}) — you are{" "}
        {actor.account.email}
      </span>
      <button
        type="button"
        className="small"
        disabled={end.isPending}
        onClick={() =>
          end.mutate(undefined, {
            // Back to somewhere the impersonator can actually see: an
            // operator's collection is not theirs once they step out of it.
            onSuccess: () => void navigate("/"),
          })
        }
      >
        {end.isPending ? "Ending…" : "End impersonation"}
      </button>
    </div>
  );
};

export default function Shell() {
  const session = useSession();
  const signOut = useSignOut();
  const location = useLocation();
  const navigate = useNavigate();

  const actor = session.data?.actor ?? null;
  const onSignIn = location.pathname === "/signin";

  // Everything below requires a session; unauthenticated access to any
  // application data is refused by the API too (§5.1).
  useEffect(() => {
    if (session.isPending) return;
    if (!actor && !onSignIn) void navigate("/signin", { replace: true });
    if (actor && onSignIn) void navigate("/", { replace: true });
  }, [session.isPending, actor, onSignIn, navigate]);

  if (session.isPending) return <Splash />;

  if (!actor) {
    return (
      <main className="auth">
        <Outlet />
      </main>
    );
  }

  if (onSignIn) return <Splash label="Signing in…" />;

  return (
    <div className="shell">
      <header className="topbar">
        <Link to={["index"]} className="brand">
          MailHub <span>{actor.identity.role}</span>
        </Link>

        <nav className="nav">
          {NAV.filter(({ when }) => when(actor)).map(({ to, label }) => (
            <NavLink key={to} to={to} end={to === "/"}>
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="whoami">
          <NavLink to="/account">{actor.account.email}</NavLink>
          <button
            type="button"
            className="quiet small"
            onClick={() => signOut.mutate()}
            disabled={signOut.isPending}
          >
            Sign out
          </button>
        </div>
      </header>

      {actor.impersonating ? <ImpersonationBanner actor={actor} /> : null}

      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}
