import type {
  ActivityEntryT,
  AddressT,
  CollectionT,
  EmailT,
  ProviderT,
  SessionT,
  TestAddressT,
  UserT,
} from "@/domain/types";

/**
 * Row shapes and the mappers into domain records.
 *
 * SQLite hands back snake_case columns and stores no booleans, arrays or
 * objects; every read crosses that boundary exactly once, here, so the rest of
 * the domain never sees a `to_addresses` string or an integer standing in for
 * a flag.
 */

export type UserRow = {
  id: string;
  role: string;
  email: string;
  password_hash: string;
  admin_id: string | null;
  disabled_at: string | null;
  created_at: string;
  updated_at: string;
};

export const toUser = (row: UserRow): UserT => ({
  id: row.id,
  role: row.role as UserT["role"],
  email: row.email,
  adminId: row.admin_id,
  disabledAt: row.disabled_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export type SessionRow = {
  id: string;
  user_id: string;
  impersonated_user_id: string | null;
  created_at: string;
  expires_at: string;
  last_seen_at: string;
};

export const toSession = (row: SessionRow): SessionT => ({
  id: row.id,
  userId: row.user_id,
  impersonatedUserId: row.impersonated_user_id,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  lastSeenAt: row.last_seen_at,
});

export type ProviderRow = {
  id: string;
  admin_id: string;
  name: string;
  type: string;
  config: string;
  created_at: string;
  updated_at: string;
};

export const toProvider = (row: ProviderRow): ProviderT => ({
  id: row.id,
  adminId: row.admin_id,
  name: row.name,
  type: row.type as ProviderT["type"],
  config: JSON.parse(row.config) as Record<string, unknown>,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export type CollectionRow = {
  id: string;
  operator_id: string;
  name: string;
  schedule_mode: string;
  provider_id: string | null;
  created_at: string;
  updated_at: string;
};

export const toCollection = (row: CollectionRow): CollectionT => ({
  id: row.id,
  operatorId: row.operator_id,
  name: row.name,
  scheduleMode: row.schedule_mode as CollectionT["scheduleMode"],
  providerId: row.provider_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export type EmailRow = {
  id: string;
  collection_id: string;
  from_address: string;
  from_name: string | null;
  to_addresses: string;
  cc_addresses: string | null;
  bcc_addresses: string | null;
  subject: string;
  text_body: string | null;
  html_body: string | null;
  state: string;
  delivery_status: string;
  attempts: number;
  last_error: string | null;
  provider_message_id: string | null;
  source: string;
  created_at: string;
  reviewed_at: string | null;
  sent_at: string | null;
};

const parseAddresses = (value: string | null): Array<AddressT> =>
  value ? (JSON.parse(value) as Array<AddressT>) : [];

export const toEmail = (row: EmailRow): EmailT => ({
  id: row.id,
  collectionId: row.collection_id,
  from: row.from_name
    ? { address: row.from_address, name: row.from_name }
    : { address: row.from_address },
  to: parseAddresses(row.to_addresses),
  cc: parseAddresses(row.cc_addresses),
  bcc: parseAddresses(row.bcc_addresses),
  subject: row.subject,
  text: row.text_body,
  html: row.html_body,
  state: row.state as EmailT["state"],
  deliveryStatus: row.delivery_status as EmailT["deliveryStatus"],
  attempts: row.attempts,
  lastError: row.last_error,
  providerMessageId: row.provider_message_id,
  source: row.source as EmailT["source"],
  createdAt: row.created_at,
  reviewedAt: row.reviewed_at,
  sentAt: row.sent_at,
});

export type TestAddressRow = {
  id: string;
  operator_id: string;
  address: string;
  label: string | null;
  created_at: string;
};

export const toTestAddress = (row: TestAddressRow): TestAddressT => ({
  id: row.id,
  operatorId: row.operator_id,
  address: row.address,
  label: row.label,
  createdAt: row.created_at,
});

export type ActivityRow = {
  id: number;
  action: string;
  object_type: string;
  object_id: string | null;
  object_label: string | null;
  actor_kind: string;
  actor_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  impersonator_id: string | null;
  impersonator_email: string | null;
  impersonator_role: string | null;
  scope_admin_id: string | null;
  scope_operator_id: string | null;
  detail: string | null;
  created_at: string;
};

export const toActivityEntry = (row: ActivityRow): ActivityEntryT => ({
  id: row.id,
  action: row.action,
  objectType: row.object_type,
  objectId: row.object_id,
  objectLabel: row.object_label,
  actorKind: row.actor_kind as ActivityEntryT["actorKind"],
  actorId: row.actor_id,
  actorEmail: row.actor_email,
  actorRole: row.actor_role as ActivityEntryT["actorRole"],
  impersonatorId: row.impersonator_id,
  impersonatorEmail: row.impersonator_email,
  impersonatorRole: row.impersonator_role as ActivityEntryT["impersonatorRole"],
  detail: row.detail ? (JSON.parse(row.detail) as Record<string, unknown>) : null,
  createdAt: row.created_at,
});
