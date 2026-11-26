// The app's sign-in values: a random state and a PKCE S256 challenge, each 32
// bytes as base64url without padding.
export const isNativeSignInToken = (raw: string | null): raw is string =>
  !!raw && /^[A-Za-z0-9_-]{43}$/.test(raw);

// The deep link that hands the one-time code back to Cloudstash for Mac. The
// app accepts it only for the sign-in it started, matched by state. Cloudstash
// Dev, the app's development build, asks with app=dev and has its own scheme,
// so its link never opens the released app; anything else gets the released
// app's.
export const nativeSignInLink = (
  code: string,
  state: string,
  app: string | null = null
): string => {
  const scheme = app === "dev" ? "cloudstash-dev" : "cloudstash";
  const link = new URL(`${scheme}://auth/callback`);
  link.searchParams.set("code", code);
  link.searchParams.set("state", state);
  return link.toString();
};
