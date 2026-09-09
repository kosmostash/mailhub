import { db } from "@/db";
import { type TestAddressRow, toTestAddress } from "@/db/rows";

import { assertEmailAcceptable, normalizeEmail } from "./accounts";
import * as activity from "./activity";
import { now } from "./clock";
import { conflict, forbidden, notFound } from "./errors";
import { newId } from "./ids";
import type { ActorT, TestAddressT } from "./types";

/**
 * An operator's personal "send it to me" targets (§2.5).
 *
 * They belong to the account, not to its collections, which is why
 * reassignment leaves them behind (§2.1.6) and deleting an account takes them
 * with it. Admins and the superadmin have none of their own: test sending is a
 * write action, so it happens under impersonation, using the impersonated
 * operator's list.
 */

const requireOperator = (actor: ActorT): string => {
  if (actor.identity.role !== "operator") {
    throw forbidden("Test addresses belong to operators", "wrong_role");
  }
  return actor.identity.id;
};

/** Newest first (§2.5) - the "send to me" control defaults to the first entry. */
export const listFor = (operatorId: string): Array<TestAddressT> =>
  db()
    .prepare<[string], TestAddressRow>(
      "SELECT * FROM test_addresses WHERE operator_id = ? ORDER BY created_at DESC, id DESC",
    )
    .all(operatorId)
    .map(toTestAddress);

export const create = (actor: ActorT, input: { address: string; label?: string }): TestAddressT => {
  const operatorId = requireOperator(actor);
  const address = normalizeEmail(input.address);
  assertEmailAcceptable(address);

  if (listFor(operatorId).some((entry) => entry.address === address)) {
    throw conflict("That address is already on your list", "test_address_exists");
  }

  const label = input.label?.trim() || null;
  const entry: TestAddressT = {
    id: newId(),
    operatorId,
    address,
    label,
    createdAt: now(),
  };

  db()
    .prepare(
      `INSERT INTO test_addresses (id, operator_id, address, label, created_at)
       VALUES (@id, @operatorId, @address, @label, @createdAt)`,
    )
    .run(entry);

  activity.record({
    action: "test_address.create",
    objectType: "test_address",
    objectId: entry.id,
    objectLabel: entry.address,
    actor,
  });

  return entry;
};

export const remove = (actor: ActorT, id: string): void => {
  const operatorId = requireOperator(actor);
  const entry = listFor(operatorId).find((candidate) => candidate.id === id);
  if (!entry) throw notFound("Test address");

  db().prepare("DELETE FROM test_addresses WHERE id = ?").run(id);

  activity.record({
    action: "test_address.delete",
    objectType: "test_address",
    objectId: entry.id,
    objectLabel: entry.address,
    actor,
  });
};
