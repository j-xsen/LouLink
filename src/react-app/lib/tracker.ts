declare global {
  interface Window {
    jws?: {
      track: (event: string, data?: Record<string, unknown>) => void;
    };
  }
}

export function trackEvent(name: string, data?: Record<string, unknown>) {
  window.jws?.track(name, data);
}
