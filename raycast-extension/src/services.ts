import { ServiceMap } from "effect";

export const AuthService = ServiceMap.Service<{
  readonly getApiKey: () => Promise<string>;
  readonly clearApiKey: () => Promise<void>;
}>("AuthService");

export const ClipboardService = ServiceMap.Service<{
  readonly readText: () => Promise<string | undefined>;
}>("ClipboardService");

export const HttpService = ServiceMap.Service<{
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
}>("HttpService");

export const HudService = ServiceMap.Service<{
  readonly show: (message: string) => Promise<void>;
}>("HudService");

export const PreferencesService = ServiceMap.Service<{
  readonly serverUrl: string;
}>("PreferencesService");

export type AuthService = ServiceMap.Service.Identifier<typeof AuthService>;
export type ClipboardService = ServiceMap.Service.Identifier<
  typeof ClipboardService
>;
export type HttpService = ServiceMap.Service.Identifier<typeof HttpService>;
export type HudService = ServiceMap.Service.Identifier<typeof HudService>;
export type PreferencesService = ServiceMap.Service.Identifier<
  typeof PreferencesService
>;
