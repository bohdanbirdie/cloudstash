export const RAYCAST_REDIRECT_ORIGIN = "https://raycast.com";

export const isAllowedRedirectUri = (raw: string | null): raw is string => {
  if (!raw) return false;
  try {
    return new URL(raw).origin === RAYCAST_REDIRECT_ORIGIN;
  } catch {
    return false;
  }
};
