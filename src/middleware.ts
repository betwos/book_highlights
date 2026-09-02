export { auth as middleware } from "@/auth";

/**
 * The primary access gate: everything is protected except the auth endpoints
 * themselves (which must stay reachable to sign in), Next's static assets, and
 * locally-stored cover images.
 *
 * Middleware is not the only check — the route handlers and server actions that
 * mutate data or spend model credits call `unauthorized()` / `requireSession()`
 * as well, so a middleware bypass does not become a write.
 */
export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|uploads).*)"],
};
