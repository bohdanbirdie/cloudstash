// The native app listens on a loopback address for the sign-in result (RFC 8252
// section 7.3). Only plain-HTTP loopback literals are accepted, so the pairing
// code can never be sent to another machine.
export const NATIVE_REDIRECT_PATH = "/callback";

export const isAllowedNativeRedirectUri = (
  raw: string | null
): raw is string => {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return (
      url.protocol === "http:" &&
      url.hostname === "127.0.0.1" &&
      url.port !== "" &&
      url.pathname === NATIVE_REDIRECT_PATH &&
      url.search === "" &&
      url.hash === "" &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
};

// A PKCE S256 challenge: 32 bytes, base64url without padding.
export const isNativeCodeChallenge = (raw: string | null): raw is string =>
  !!raw && /^[A-Za-z0-9_-]{43}$/.test(raw);
