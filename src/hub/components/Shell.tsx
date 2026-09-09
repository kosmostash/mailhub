import {
  ActivityIcon,
  InboxIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  SendIcon,
  ServerIcon,
  ShieldIcon,
  SunIcon,
  UserCogIcon,
  UserIcon,
  UsersIcon,
  VenetianMaskIcon,
} from "lucide-react";
import { useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Skeleton } from "~/components/ui/skeleton";
import { Toaster } from "~/components/ui/sonner";
import { TooltipProvider } from "~/components/ui/tooltip";
import { type ThemeT, useTheme } from "~/hooks/theme";
import {
  type ActorT,
  useEndImpersonation,
  useSession,
  useSignOut,
} from "~/hooks/session";
import { cn } from "~/lib/utils";

/**
 * The application shell.
 *
 * It owns the two things no page should have to think about: whether there is
 * a session at all, and - when the session is standing in someone else's shoes
 * - saying so unmistakably, on every screen (§2.2).
 */

const NAV: Array<{
  to: string;
  label: string;
  icon: typeof InboxIcon;
  when: (actor: ActorT) => boolean;
}> = [
  { to: "/", label: "Collections", icon: InboxIcon, when: () => true },
  {
    to: "/providers",
    label: "Providers",
    icon: ServerIcon,
    when: (actor) => actor.capabilities.manageProviders,
  },
  {
    to: "/operators",
    label: "Operators",
    icon: UsersIcon,
    when: (actor) => actor.capabilities.manageOperators,
  },
  {
    to: "/admins",
    label: "Admins",
    icon: ShieldIcon,
    when: (actor) => actor.capabilities.manageAdmins,
  },
  // Operators may be shown their own trail; they never see anyone else's, and
  // the endpoint scopes it for them (§2.6).
  { to: "/activity", label: "Activity", icon: ActivityIcon, when: () => true },
];

const THEMES: Array<{ value: ThemeT; label: string; icon: typeof SunIcon }> = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
];

const ThemeMenu = () => {
  const { theme, setTheme } = useTheme();
  const Current = THEMES.find((entry) => entry.value === theme)?.icon ?? MonitorIcon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Theme">
          <Current />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {THEMES.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem key={value} onSelect={() => setTheme(value)}>
            <Icon />
            {label}
            {theme === value ? (
              <span className="text-muted-foreground ml-auto text-xs">✓</span>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/**
 * Impersonation is visible at all times, in a bar that cannot be mistaken for
 * chrome (§2.2). Ending it returns to the dashboard, because the page you were
 * on very likely belonged to the identity you just stepped out of.
 */
const ImpersonationBar = ({ actor }: { actor: ActorT }) => {
  const end = useEndImpersonation();
  const navigate = useNavigate();

  return (
    <div className="bg-pending-soft text-pending border-pending/25 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b px-4 py-2 text-sm">
      <VenetianMaskIcon className="size-4 shrink-0" />
      <span>
        Acting as <strong className="font-semibold">{actor.identity.email}</strong> (
        {actor.identity.role}) — you are {actor.account.email}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={end.isPending}
        onClick={() => end.mutate(undefined, { onSuccess: () => void navigate("/") })}
      >
        {end.isPending ? "Ending…" : "End impersonation"}
      </Button>
    </div>
  );
};

const Sidebar = ({ actor }: { actor: ActorT }) => (
  <aside className="bg-card hidden w-56 shrink-0 flex-col border-r md:flex">
    <div className="flex h-14 items-center gap-2 border-b px-4">
      <SendIcon className="text-primary size-4.5" />
      <span className="font-semibold tracking-tight">MailHub</span>
    </div>

    <nav className="flex-1 space-y-0.5 p-2">
      {NAV.filter(({ when }) => when(actor)).map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )
          }
        >
          <Icon className="size-4" />
          {label}
        </NavLink>
      ))}
    </nav>

    <div className="text-muted-foreground border-t px-4 py-3 text-xs">
      <div className="flex items-center gap-1.5">
        <span className="bg-sent size-1.5 rounded-full" />
        Signed in as {actor.identity.role}
      </div>
    </div>
  </aside>
);

export default function Shell() {
  const session = useSession();
  const signOut = useSignOut();
  const location = useLocation();
  const navigate = useNavigate();

  const actor = session.data?.actor ?? null;
  const onSignIn = location.pathname === "/signin";

  // Everything below requires a session; the API refuses unauthenticated
  // access to any application data too (§5.1).
  useEffect(() => {
    if (session.isPending) return;
    if (!actor && !onSignIn) void navigate("/signin", { replace: true });
    if (actor && onSignIn) void navigate("/", { replace: true });
  }, [session.isPending, actor, onSignIn, navigate]);

  if (session.isPending) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Skeleton className="h-24 w-64" />
      </div>
    );
  }

  // Signed out and not yet redirected: render nothing rather than mounting a
  // page that would fire a request it is about to be told it cannot make.
  if (!actor && !onSignIn) return <div className="min-h-screen" />;

  if (!actor) {
    return (
      <TooltipProvider>
        <main className="grid min-h-screen place-items-center p-6">
          <Outlet />
        </main>
        <Toaster />
      </TooltipProvider>
    );
  }

  if (onSignIn) return <div className="min-h-screen" />;

  return (
    <TooltipProvider>
      <div className="flex min-h-screen">
        <Sidebar actor={actor} />

        <div className="flex min-w-0 flex-1 flex-col">
          {actor.impersonating ? <ImpersonationBar actor={actor} /> : null}

          <header className="bg-card/80 sticky top-0 z-20 flex h-14 items-center gap-3 border-b px-4 backdrop-blur md:px-6">
            {/* The sidebar is hidden on narrow screens; the nav collapses here. */}
            <div className="flex items-center gap-1 md:hidden">
              {NAV.filter(({ when }) => when(actor)).map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/"}
                  aria-label={label}
                  className={({ isActive }) =>
                    cn(
                      "rounded-md p-2 transition-colors",
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/60",
                    )
                  }
                >
                  <Icon className="size-4" />
                </NavLink>
              ))}
            </div>

            <div className="flex-1" />

            <ThemeMenu />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <UserIcon />
                  <span className="hidden max-w-40 truncate sm:inline">
                    {actor.account.email}
                  </span>
                  {actor.impersonating ? (
                    <Badge variant="pending">as {actor.identity.role}</Badge>
                  ) : null}
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-foreground truncate text-sm font-medium">
                  {actor.account.email}
                </DropdownMenuLabel>
                <DropdownMenuLabel>{actor.account.role}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void navigate("/account")}>
                  <UserCogIcon />
                  Account settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => signOut.mutate()}>
                  <LogOutIcon />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>

          <main className="mx-auto w-full max-w-[1200px] flex-1 p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>

      <Toaster />
    </TooltipProvider>
  );
}
