import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";

import fetchClients from "_/fetch";

import AccountManager from "~/components/AccountManager";
import { PageSkeleton, errorMessage } from "~/components/domain";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { useSession, useStartImpersonation } from "~/hooks/session";

/**
 * The operators page (§5.7) - an admin's own operators.
 *
 * Impersonation is here rather than on a page of its own because this is where
 * you already are when you decide you need it: you came to look at an operator
 * and found something that needs doing in their identity.
 */
export default function OperatorsPage() {
  const session = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const impersonate = useStartImpersonation();

  // Ending an impersonation takes this capability away while the page is still
  // mounted; asking anyway would just earn a 403 on the way out.
  const canManage = session.data?.actor?.capabilities.manageOperators === true;

  const operators = useQuery({
    queryKey: ["operators"],
    queryFn: () => fetchClients.operators.GET(),
    enabled: canManage,
  });

  const refresh = () => queryClient.invalidateQueries();

  if (!canManage || operators.isPending) return <PageSkeleton />;
  if (operators.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{errorMessage(operators.error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <AccountManager
      title="Operators"
      noun="operator"
      description="The people who run your email streams day to day. They own the collections and the review queue; you own the providers they send through."
      accounts={operators.data.operators.map((operator) => ({
        id: operator.id,
        email: operator.email,
        disabled: operator.disabled,
        deletable: operator.deletable,
        lastActivityAt: operator.lastActivityAt,
        holdings: [
          { label: "collections", value: operator.collections },
          { label: "pending", value: operator.pending },
        ],
      }))}
      disableWarning={() =>
        "Their sessions are revoked immediately, their collections stop accepting submissions (403), and their ready mail stops sending. Nothing is deleted, and re-enabling resumes everything where it stopped."
      }
      onCreate={(input) =>
        fetchClients.operators.POST([], { json: input }).then(refresh)
      }
      onSetDisabled={(id, disabled) =>
        fetchClients["operators/[id]/status"].PUT([id], { json: { disabled } }).then(refresh)
      }
      onResetPassword={(id, password) =>
        fetchClients["operators/[id]/password"].PUT([id], { json: { password } })
      }
      onReassign={(id, targetId) =>
        fetchClients["operators/[id]/reassign"].POST([id], { json: { targetId } }).then(refresh)
      }
      onDelete={(id) => fetchClients["operators/[id]"].DELETE([id]).then(refresh)}
      onImpersonate={(id) =>
        impersonate.mutate(id, { onSuccess: () => void navigate("/") })
      }
      error={impersonate.error}
    />
  );
}
