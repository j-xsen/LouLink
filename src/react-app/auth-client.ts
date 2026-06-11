import { createAuthClient } from "better-auth/client";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_AUTH_URL,
});

export async function getJwt(): Promise<string | null> {
  const { data } = await authClient.$fetch<{ token: string }>("/token");
  return data?.token ?? null;
}
