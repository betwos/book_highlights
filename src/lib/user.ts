/**
 * Single-user v1 (SPEC 4.10). Every query is written scoped by this value so that
 * adding auth later is a change of this function body, not a migration plus an
 * audit of every query.
 */
export const LOCAL_USER_ID = "local";

export function currentUserId(): string {
  return LOCAL_USER_ID;
}
