/**
 * Domain vocabulary.
 *
 * Every name here carries a `T` suffix. That is not decoration: KosmoJS
 * flattens these types into JSON Schema, and a type named after a built-in
 * (`Response`, `Event`, `Record`, ...) is silently resolved to the built-in
 * instead - so the suffix is what keeps `EmailT` meaning *this* email.
 */

export type RoleT = "superadmin" | "admin" | "operator";

/** An email string with an optional display name (§2.7). */
export type AddressT = {
  address: string;
  name?: string;
};

/** Where a submitted email starts its life (§2.3). */
export type ScheduleModeT = "after_review" | "immediate";

/** The review state (§2.7). `pending -> ready -> sent`, and nothing else. */
export type EmailStateT = "pending" | "ready" | "sent";

/** What the provider reported, orthogonal to the review state (§2.7). */
export type DeliveryStatusT = "unknown" | "sent" | "delivered" | "bounced";

/** How an email reached MailHub. */
export type EmailSourceT = "http" | "smtp";

export type UserT = {
  id: string;
  role: RoleT;
  email: string;
  /** The admin an operator belongs to; null for admins and the superadmin. */
  adminId: string | null;
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SessionT = {
  id: string;
  userId: string;
  impersonatedUserId: string | null;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
};

/**
 * Who is acting, and on whose behalf.
 *
 * `account` is the signed-in user; `identity` is who they are acting *as*.
 * Outside impersonation the two are the same object, which is why the rest of
 * the domain can read `identity` and never think about impersonation again.
 */
export type ActorT = {
  session: SessionT;
  account: UserT;
  identity: UserT;
  impersonating: boolean;
};

export type ProviderTypeT = "smtp" | "sendgrid" | "ses";

export type SmtpProviderConfigT = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  /** Accept self-signed certificates - private relays often use them. */
  allowInsecureTls?: boolean;
};

export type ProviderT = {
  id: string;
  adminId: string;
  name: string;
  type: ProviderTypeT;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CollectionT = {
  id: string;
  operatorId: string;
  name: string;
  scheduleMode: ScheduleModeT;
  providerId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EmailT = {
  id: string;
  collectionId: string;
  from: AddressT;
  to: Array<AddressT>;
  cc: Array<AddressT>;
  bcc: Array<AddressT>;
  subject: string;
  text: string | null;
  html: string | null;
  state: EmailStateT;
  deliveryStatus: DeliveryStatusT;
  attempts: number;
  lastError: string | null;
  providerMessageId: string | null;
  source: EmailSourceT;
  createdAt: string;
  reviewedAt: string | null;
  sentAt: string | null;
};

export type TestAddressT = {
  id: string;
  operatorId: string;
  address: string;
  label: string | null;
  createdAt: string;
};

/** Counters shown on a collection card (§5.2). */
export type CollectionCountersT = {
  total: number;
  pending: number;
  ready: number;
  sent: number;
  delivered: number;
  bounced: number;
};

export type ActivityActorKindT = "user" | "sender" | "smtp";

export type ActivityEntryT = {
  id: number;
  action: string;
  objectType: string;
  objectId: string | null;
  objectLabel: string | null;
  actorKind: ActivityActorKindT;
  actorId: string | null;
  actorEmail: string | null;
  actorRole: RoleT | null;
  /** Set when the action was performed via impersonation (§2.2). */
  impersonatorId: string | null;
  impersonatorEmail: string | null;
  impersonatorRole: RoleT | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
};

/** The outcome of one email in a send request (§4.2). */
export type SendOutcomeT = {
  id: string;
  ok: boolean;
  error?: string;
  code?: string;
  providerMessageId?: string;
};
