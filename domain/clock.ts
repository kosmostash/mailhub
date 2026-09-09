/**
 * One clock for the whole domain.
 *
 * Everything is stored as an ISO-8601 UTC string, which sorts lexicographically
 * in SQLite and needs no conversion on the way to JSON. Routing every timestamp
 * through here also gives the test suite a single seam to freeze.
 */

let source: () => Date = () => new Date();

export const now = (): string => source().toISOString();

export const nowDate = (): Date => source();

/** Add minutes to the current instant - code expiry, session lifetime. */
export const inMinutes = (minutes: number): string =>
  new Date(source().getTime() + minutes * 60_000).toISOString();

export const inHours = (hours: number): string => inMinutes(hours * 60);

export const isPast = (timestamp: string): boolean =>
  new Date(timestamp).getTime() <= source().getTime();

/** Tests only: install a fixed or scripted clock. Returns the restore function. */
export const setClock = (fn: () => Date): (() => void) => {
  const previous = source;
  source = fn;
  return () => {
    source = previous;
  };
};
