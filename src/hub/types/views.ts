import type {
  ActivityEntryT,
  ActorT,
  CollectionCountersT,
  CollectionT,
  EmailT,
  ProviderT,
  RoleT,
  TestAddressT,
  UserT,
} from "@/domain/types";
import type { AddressViewT } from "@/domain/wire";

/**
 * The hub's wire shapes.
 *
 * These live in the folder rather than in `@/domain/wire` because they are the
 * hub UI's contract with its own backend - nobody else answers with them. The
 * shapes shared with client projects (a stored email, an address) come from
 * `@/domain/wire` and are reused here rather than restated.
 *
 * Declaring them as the handlers' `response` is what makes the typed fetch
 * clients typed: without it the client returns `unknown`.
 */

export type AccountViewT = {
  id: string;
  email: string;
  role: RoleT;
};

/**
 * What the signed-in person may do *right now* - computed from the effective
 * identity, so it flips the moment impersonation starts or ends. The UI shows
 * and hides controls from this; the API enforces the same rules itself.
 */
export type CapabilitiesViewT = {
  manageCollections: boolean;
  manageProviders: boolean;
  manageOperators: boolean;
  manageAdmins: boolean;
  impersonate: boolean;
};

export type ActorViewT = {
  /** The signed-in account. */
  account: AccountViewT;
  /** Who they are acting as - the same account unless impersonating (§2.2). */
  identity: AccountViewT;
  impersonating: boolean;
  capabilities: CapabilitiesViewT;
};

export type SessionViewT = {
  actor: ActorViewT | null;
  /** True on a fresh install, where the app proposes creating one (§2.1.4). */
  needsBootstrap: boolean;
};

const accountView = (user: UserT): AccountViewT => ({
  id: user.id,
  email: user.email,
  role: user.role,
});

export const capabilitiesOf = (actor: ActorT): CapabilitiesViewT => {
  const role = actor.identity.role;
  return {
    manageCollections: role === "operator",
    manageProviders: role === "admin",
    manageOperators: role === "admin",
    // Admin management is the superadmin's own, and never carried into an
    // assumed identity.
    manageAdmins: role === "superadmin" && !actor.impersonating,
    impersonate: !actor.impersonating && actor.account.role !== "operator",
  };
};

export const actorView = (actor: ActorT): ActorViewT => ({
  account: accountView(actor.account),
  identity: accountView(actor.identity),
  impersonating: actor.impersonating,
  capabilities: capabilitiesOf(actor),
});

export type CollectionCardT = {
  id: string;
  name: string;
  scheduleMode: "after_review" | "immediate";
  providerId: string | null;
  providerName: string | null;
  owner: AccountViewT;
  counters: CollectionCountersT;
};

export const collectionCard = (input: {
  collection: CollectionT;
  owner: UserT;
  providerName: string | null;
  counters: CollectionCountersT;
}): CollectionCardT => ({
  id: input.collection.id,
  name: input.collection.name,
  scheduleMode: input.collection.scheduleMode,
  providerId: input.collection.providerId,
  providerName: input.providerName,
  owner: accountView(input.owner),
  counters: input.counters,
});

/** A row in the collection's email list (§5.4) - no bodies, they are large. */
export type EmailSummaryT = {
  id: string;
  subject: string;
  from: AddressViewT;
  to: Array<AddressViewT>;
  state: "pending" | "ready" | "sent";
  deliveryStatus: "unknown" | "sent" | "delivered" | "bounced";
  attempts: number;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
};

export const emailSummary = (email: EmailT): EmailSummaryT => ({
  id: email.id,
  subject: email.subject,
  from: email.from,
  to: email.to,
  state: email.state,
  deliveryStatus: email.deliveryStatus,
  attempts: email.attempts,
  lastError: email.lastError,
  createdAt: email.createdAt,
  sentAt: email.sentAt,
});

/** What an operator is allowed to know about a provider: name and type (§2.4). */
export type ProviderChoiceViewT = {
  id: string;
  name: string;
  type: string;
};

/** The admin's view, with the configuration's secrets masked (§5.6). */
export type ProviderViewT = {
  id: string;
  name: string;
  type: string;
  implemented: boolean;
  config: { [key: string]: string | number | boolean | null };
  collections: number;
  createdAt: string;
  updatedAt: string;
};

export const providerView = (
  provider: ProviderT,
  extra: { implemented: boolean; collections: number },
): ProviderViewT => ({
  id: provider.id,
  name: provider.name,
  type: provider.type,
  implemented: extra.implemented,
  config: provider.config as ProviderViewT["config"],
  collections: extra.collections,
  createdAt: provider.createdAt,
  updatedAt: provider.updatedAt,
});

export type OperatorSummaryT = {
  id: string;
  email: string;
  disabled: boolean;
  collections: number;
  pending: number;
  lastActivityAt: string | null;
  /** Only a disabled account holding nothing may be deleted (§2.1.6). */
  deletable: boolean;
};

export type AdminSummaryT = {
  id: string;
  email: string;
  disabled: boolean;
  operators: number;
  providers: number;
  collections: number;
  pending: number;
  lastActivityAt: string | null;
  deletable: boolean;
};

export type TestAddressViewT = {
  id: string;
  address: string;
  label: string | null;
  createdAt: string;
};

export const testAddressView = (entry: TestAddressT): TestAddressViewT => ({
  id: entry.id,
  address: entry.address,
  label: entry.label,
  createdAt: entry.createdAt,
});

export type ActivityViewT = {
  id: number;
  action: string;
  objectType: string;
  objectId: string | null;
  objectLabel: string | null;
  actorKind: "user" | "sender" | "smtp";
  actorEmail: string | null;
  actorRole: string | null;
  /** Set when the action was performed via impersonation (§2.2). */
  impersonatorEmail: string | null;
  detail: { [key: string]: string | number | boolean | null } | null;
  createdAt: string;
};

export const activityView = (entry: ActivityEntryT): ActivityViewT => ({
  id: entry.id,
  action: entry.action,
  objectType: entry.objectType,
  objectId: entry.objectId,
  objectLabel: entry.objectLabel,
  actorKind: entry.actorKind,
  actorEmail: entry.actorEmail,
  actorRole: entry.actorRole,
  impersonatorEmail: entry.impersonatorEmail,
  detail: entry.detail as ActivityViewT["detail"],
  createdAt: entry.createdAt,
});

/** One email's outcome in a send or approve request (§4.2). */
export type OutcomeViewT = {
  id: string;
  ok: boolean;
  error?: string;
  code?: string;
};
