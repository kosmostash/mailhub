import type { CollectionT } from "@/domain/types";

/**
 * Folder-wide context types.
 *
 * `collection` is populated by the native middleware in `api/app.ts`, which
 * runs before any route chain - see the note there for why it is not a
 * cascading `use.ts`.
 */
export declare module "_/api" {
  interface DefaultVariables {
    collection: CollectionT;
  }
  interface DefaultBindings {}
}
