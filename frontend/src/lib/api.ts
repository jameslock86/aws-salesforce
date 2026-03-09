type Json = Record<string, any>;

const BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");
const ADMIN_TOKEN = process.env.NEXT_PUBLIC_ADMIN_TOKEN || "";

function mustHaveBase() {
  if (!BASE) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL is not set. Add it in .env.local (or Vercel env vars)."
    );
  }
}

async function request<T = Json>(
  path: string,
  opts: RequestInit & { admin?: boolean } = {}
): Promise<T> {
  mustHaveBase();

  const url = `${BASE}${path.startsWith("/") ? "" : "/"}${path}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(opts.headers as Record<string, string> | undefined),
  };

  if (opts.admin) {
    if (!ADMIN_TOKEN) {
      throw new Error(
        "NEXT_PUBLIC_ADMIN_TOKEN is not set. Add it in .env.local (or Vercel env vars)."
      );
    }
    headers["x-admin-token"] = ADMIN_TOKEN;
  }

  if (
    opts.method &&
    opts.method.toUpperCase() !== "GET" &&
    !headers["Content-Type"]
  ) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, {
    ...opts,
    headers,
    cache: "no-store",
  });

  const text = await res.text();
  let data: any = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const msg =
      data?.error ||
      data?.message ||
      data?.details ||
      `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return data as T;
}

export const api = {
  // public
  health: () => request<{ ok: boolean; message?: string }>("/"),
  tcpCheck: () =>
    request<{
      target: { host: string; port: number };
      result: { ok: boolean; connected: boolean; ms?: number; error?: string };
    }>("/tcp-check"),
  dbTables: () => request<{ ok: boolean; tables: string[] }>("/db/tables"),
  dbCounts: () =>
    request<{ ok: boolean; counts: Record<string, number> }>("/db/counts"),
  dbSample: (table: string, limit = 25) =>
    request<{ ok: boolean; table?: string; limit?: number; rows: any[] }>(
      `/db/sample?table=${encodeURIComponent(table)}&limit=${encodeURIComponent(
        String(limit)
      )}`
    ),

  // admin (token)
  migrate: () => request<any>("/migrate", { method: "POST", admin: true }),
  seedLeads: () => request<any>("/seed/leads", { method: "POST", admin: true }),
  seedAccounts: () =>
    request<any>("/seed/accounts", { method: "POST", admin: true }),
  linkConverted: () =>
    request<any>("/link/leads-to-accounts-converted", {
      method: "POST",
      admin: true,
    }),
};
