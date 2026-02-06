type EventProperties = Record<string, string | number | boolean>;

declare global {
  interface Window {
    stonks?: {
      event: (name: string, properties?: EventProperties) => void;
    };
  }
}

export function track(event: string, properties?: EventProperties) {
  try {
    window.stonks?.event(event, properties);
  } catch {
    // Silently fail - analytics should never break the app
  }
}
