import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";

import fetchClients from "_/fetch";

import AccountManager from "~/components/AccountManager";
import { ErrorNotice, Splash } from "~/components/ui";
import { useStartImpersonation } from "~/hooks/session";

/**
 * The admins page (§5.8) - the superadmin's landing view.
 *
 * The same workflow as the operators page, one level up: create, reset,
 * disable, reassign, delete. What differs is only the blast radius, which the
 * disable confirmation spells out, and what counts as "holds nothing" -
 * operators and providers rather than collections.
 */
export default function AdminsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const impersonate = useStartImpersonation();

  const admins = useQuery({
    queryKey: ["admins"],
    queryFn: () => fetchClients.admins.GET(),
  });

  const refresh = () => queryClient.invalidateQueries();

  if (admins.isPending) return <Splash />;
  if (admins.error) return <ErrorNotice error={admins.error} />;

  return (
    <AccountManager
      title="Admins"
      noun="admin"
      description="Each admin oversees their own operators and owns the providers those operators send through. Admins never see each other's trees - only you do."
      accounts={admins.data.admins.map((admin) => ({
        id: admin.id,
        email: admin.email,
        disabled: admin.disabled,
        deletable: admin.deletable,
        lastActivityAt: admin.lastActivityAt,
        holdings: [
          { label: "operators", value: admin.operators },
          { label: "providers", value: admin.providers },
          { label: "collections", value: admin.collections },
          { label: "pending", value: admin.pending },
        ],
      }))}
      disableWarning={(account) =>
        `Disable ${account.email}?\n\n` +
        "This covers their whole subtree: the admin's sessions and every one of " +
        "their operators' are revoked at once, submissions to their collections are " +
        "refused, and their mail stops sending. Delivery events for already-sent mail " +
        "keep arriving, so history stays truthful."
      }
      onCreate={(input) => fetchClients.admins.POST([], { json: input }).then(refresh)}
      onSetDisabled={(id, disabled) =>
        fetchClients["admins/[id]/status"].PUT([id], { json: { disabled } }).then(refresh)
      }
      onResetPassword={(id, password) =>
        fetchClients["admins/[id]/password"].PUT([id], { json: { password } })
      }
      onReassign={(id, targetId) =>
        fetchClients["admins/[id]/reassign"].POST([id], { json: { targetId } }).then(refresh)
      }
      onDelete={(id) => fetchClients["admins/[id]"].DELETE([id]).then(refresh)}
      onImpersonate={(id) =>
        impersonate.mutate(id, { onSuccess: () => void navigate("/") })
      }
      error={impersonate.error}
    />
  );
}
