import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import fetchClients, { type ResponseT } from "_/fetch";

/**
 * The session, and the things that change it.
 *
 * Every page reads the signed-in actor from here rather than through props, so
 * a sign-in, a sign-out or an impersonation switch re-renders the whole app
 * with the new capabilities - which is what keeps the UI's controls and the
 * API's rules from drifting apart.
 */

export type SessionT = ResponseT["session"]["GET"];
export type ActorT = NonNullable<SessionT["actor"]>;

export const SESSION_KEY = ["session"] as const;

export const useSession = () =>
  useQuery({
    queryKey: SESSION_KEY,
    queryFn: () => fetchClients.session.GET(),
    // The session is the one thing worth re-checking on focus: it can be
    // revoked from under you by a disable (§2.1.5).
    staleTime: 10_000,
    retry: false,
  });

/**
 * Everything the hub shows depends on who is acting, so a change of identity
 * clears the lot rather than guessing which queries survived it.
 *
 * `removeQueries`, not `invalidateQueries`: invalidating refetches immediately,
 * before React has re-rendered with the new capabilities - so a page you can no
 * longer see fires one last request and earns a 403 on its way out. Removing
 * drops the data without refetching, and the re-render that follows decides
 * what to ask for, with the new identity already in hand.
 */
export const useIdentityChange = () => {
  const queryClient = useQueryClient();
  return (session: SessionT) => {
    queryClient.setQueryData(SESSION_KEY, session);
    queryClient.removeQueries({
      predicate: (query) => query.queryKey[0] !== SESSION_KEY[0],
    });
  };
};

export const useSignIn = () => {
  const applied = useIdentityChange();
  return useMutation({
    mutationFn: (credentials: { email: string; password: string }) =>
      fetchClients.session.POST([], { json: credentials }),
    onSuccess: applied,
  });
};

export const useBootstrap = () => {
  const applied = useIdentityChange();
  return useMutation({
    mutationFn: (credentials: { email: string; password: string }) =>
      fetchClients.bootstrap.POST([], { json: credentials }),
    onSuccess: applied,
  });
};

export const useSignOut = () => {
  const applied = useIdentityChange();
  return useMutation({
    mutationFn: () => fetchClients.session.DELETE(),
    onSuccess: applied,
  });
};

export const useStartImpersonation = () => {
  const applied = useIdentityChange();
  return useMutation({
    mutationFn: (userId: string) =>
      fetchClients.impersonation.POST([], { json: { userId } }),
    onSuccess: applied,
  });
};

export const useEndImpersonation = () => {
  const applied = useIdentityChange();
  return useMutation({
    mutationFn: () => fetchClients.impersonation.DELETE(),
    onSuccess: applied,
  });
};
