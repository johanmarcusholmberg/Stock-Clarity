// Central wrapper around `fetch` that injects a Clerk Bearer token on every
// request to our API. The server's `requireSelf` middleware verifies the
// token's `userId` against the userId in the request path/query/body — so
// without this header authenticated endpoints will respond with 401.
//
// The token getter is registered ONCE from `_layout.tsx` (inside
// <ClerkLoaded>) via `setAuthTokenGetter(useAuth().getToken)`. Service
// modules that run outside the React tree call `authedFetch` directly and
// transparently get the current session token at call time.
//
// Tokens are NOT cached here — Clerk's `getToken()` already returns a
// short-lived cached JWT and refreshes near expiry, so adding our own
// caching layer would just create skew.

type TokenGetter = (options?: { template?: string }) => Promise<string | null | undefined>;

let tokenGetter: TokenGetter | null = null;

export function setAuthTokenGetter(getter: TokenGetter | null): void {
  tokenGetter = getter;
}

export function hasAuthTokenGetter(): boolean {
  return tokenGetter !== null;
}

export async function authedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  let token: string | null = null;
  if (tokenGetter) {
    try {
      token = (await tokenGetter()) ?? null;
    } catch {
      // Best-effort: a token-fetch failure shouldn't block the request.
      // The server will respond 401 if it really needed the token, which
      // bubbles back to the caller naturally.
      token = null;
    }
  }

  const headers = new Headers(init.headers);
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
}
