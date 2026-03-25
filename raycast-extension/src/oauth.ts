import { OAuth, getPreferenceValues } from "@raycast/api";

interface Preferences {
  serverUrl: string;
}

const client = new OAuth.PKCEClient({
  redirectMethod: OAuth.RedirectMethod.Web,
  providerName: "Cloudstash",
  providerIcon: "extension-icon.png",
  providerId: "cloudstash",
  description: "Connect your Cloudstash account",
});

export async function getApiKey(): Promise<string> {
  const tokenSet = await client.getTokens();
  if (tokenSet?.accessToken) {
    return tokenSet.accessToken;
  }

  const { serverUrl } = getPreferenceValues<Preferences>();
  const baseUrl = serverUrl.replace(/\/$/, "");

  const authRequest = await client.authorizationRequest({
    endpoint: `${baseUrl}/connect/raycast`,
    clientId: "raycast-extension",
    scope: "",
  });

  const { authorizationCode } = await client.authorize(authRequest);

  const response = await fetch(`${baseUrl}/api/connect/raycast/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: authorizationCode }),
  });

  if (!response.ok) {
    const error = (await response.json()) as { error?: string };
    throw new Error(error.error || "Failed to connect");
  }

  const { apiKey } = (await response.json()) as { apiKey: string };

  await client.setTokens({ accessToken: apiKey });

  return apiKey;
}

export async function clearApiKey(): Promise<void> {
  await client.removeTokens();
}

export async function isConnected(): Promise<boolean> {
  const tokenSet = await client.getTokens();
  return !!tokenSet?.accessToken;
}
