import type { ActorT } from "@/domain/types";

/**
 * Folder-wide context types.
 *
 * `actor` is populated by the native middleware in `api/app.ts`, which runs
 * before any route chain - so every route below the public ones can read a
 * resolved, non-null actor without checking for it.
 */
export declare module "_/api" {
  interface DefaultVariables {
    actor: ActorT;
  }
  interface DefaultBindings {}
}
