"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

type Status = "idle" | "loading" | "ok" | "error";

function pretty(obj: any) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

function Badge({ status }: { status: Status }) {
  const text =
    status === "idle"
      ? "idle"
      : status === "loading"
      ? "loading"
      : status === "ok"
      ? "ok"
      : "error";

  const cls =
    status === "ok"
      ? "bg-green-100 text-green-800"
      : status === "error"
      ? "bg-red-100 text-red-800"
      : status === "loading"
      ? "bg-yellow-100 text-yellow-800"
      : "bg-gray-100 text-gray-800";

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-medium ${cls}`}>
      {text}
    </span>
  );
}

function Card({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}

function Button({
  onClick,
  disabled,
  children,
  variant = "primary",
}: {
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
}) {
  const base =
    "rounded-xl px-3 py-2 text-sm font-semibold shadow-sm transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed";
  const cls =
    variant === "primary"
      ? "bg-black text-white hover:bg-black/90"
      : variant === "danger"
      ? "bg-red-600 text-white hover:bg-red-700"
      : "bg-gray-100 text-gray-900 hover:bg-gray-200";
  return (
    <button className={`${base} ${cls}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export default function Page() {
  const [health, setHealth] = useState<any>(null);
  const [tcp, setTcp] = useState<any>(null);
  const [tables, setTables] = useState<string[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [sampleLimit, setSampleLimit] = useState<number>(25);
  const [sample, setSample] = useState<any>(null);

  const [statusHealth, setStatusHealth] = useState<Status>("idle");
  const [statusTcp, setStatusTcp] = useState<Status>("idle");
  const [statusDb, setStatusDb] = useState<Status>("idle");
  const [statusSample, setStatusSample] = useState<Status>("idle");

  const [adminStatus, setAdminStatus] = useState<Status>("idle");
  const [adminOutput, setAdminOutput] = useState<any>(null);

  const apiBase = useMemo(
    () => process.env.NEXT_PUBLIC_API_BASE_URL || "",
    []
  );

  async function refreshCore() {
    setStatusHealth("loading");
    try {
      const h = await api.health();
      setHealth(h);
      setStatusHealth("ok");
    } catch (e: any) {
      setHealth({ error: e?.message || String(e) });
      setStatusHealth("error");
    }

    setStatusTcp("loading");
    try {
      const t = await api.tcpCheck();
      setTcp(t);
      setStatusTcp("ok");
    } catch (e: any) {
      setTcp({ error: e?.message || String(e) });
      setStatusTcp("error");
    }

    setStatusDb("loading");
    try {
      const t = await api.dbTables();
      const c = await api.dbCounts();
      setTables(t.tables || []);
      setCounts(c.counts || {});
      setSelectedTable((prev) => prev || t.tables?.[0] || "");
      setStatusDb("ok");
    } catch (e: any) {
      setTables([]);
      setCounts({});
      setStatusDb("error");
    }
  }

  async function refreshSample() {
    if (!selectedTable) return;
    setStatusSample("loading");
    try {
      const s = await api.dbSample(selectedTable, sampleLimit);
      setSample(s);
      setStatusSample("ok");
    } catch (e: any) {
      setSample({ error: e?.message || String(e) });
      setStatusSample("error");
    }
  }

  async function runAdmin(action: () => Promise<any>) {
    setAdminStatus("loading");
    setAdminOutput(null);
    try {
      const out = await action();
      setAdminOutput(out);
      setAdminStatus("ok");
      await refreshCore();
      await refreshSample();
    } catch (e: any) {
      setAdminOutput({ error: e?.message || String(e) });
      setAdminStatus("error");
    }
  }

  useEffect(() => {
    refreshCore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedTable) return;
    refreshSample();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTable, sampleLimit]);

  return (
    <main className="min-h-screen bg-gray-50 p-5">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-col gap-2 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">AWS Admin Dashboard</h1>
              <p className="text-sm text-gray-600">
                Demo control panel (API Gateway → Lambda → RDS + S3)
              </p>
            </div>

            <div className="flex items-center gap-2">
              <a
                href="/csv-import"
                className="rounded-xl bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-200"
              >
                CSV Import
              </a>
              <Button variant="secondary" onClick={refreshCore}>
                Refresh
              </Button>
            </div>
          </div>

          <div className="text-xs text-gray-600">
            API base:{" "}
            <span className="font-mono text-gray-900">
              {apiBase || "(missing NEXT_PUBLIC_API_BASE_URL)"}
            </span>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <Card title="API Health" right={<Badge status={statusHealth} />}>
            <pre className="max-h-48 overflow-auto rounded-xl bg-gray-100 p-3 text-xs">
              {pretty(health)}
            </pre>
          </Card>

          <Card title="DB TCP Check" right={<Badge status={statusTcp} />}>
            <pre className="max-h-48 overflow-auto rounded-xl bg-gray-100 p-3 text-xs">
              {pretty(tcp)}
            </pre>
          </Card>

          <Card title="Admin Actions" right={<Badge status={adminStatus} />}>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => runAdmin(api.migrate)}>Migrate</Button>
              <Button onClick={() => runAdmin(api.seedLeads)}>Seed Leads</Button>
              <Button onClick={() => runAdmin(api.seedAccounts)}>
                Seed Accounts
              </Button>
              <Button onClick={() => runAdmin(api.linkConverted)}>
                Link Converted
              </Button>
            </div>

            <div className="mt-3">
              <div className="mb-1 text-xs font-semibold text-gray-700">
                Output
              </div>
              <pre className="max-h-48 overflow-auto rounded-xl bg-gray-100 p-3 text-xs">
                {pretty(adminOutput)}
              </pre>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card title="DB Overview" right={<Badge status={statusDb} />}>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">Table</span>
                <select
                  className="rounded-xl border bg-white px-3 py-2 text-sm"
                  value={selectedTable}
                  onChange={(e) => setSelectedTable(e.target.value)}
                >
                  {tables.length === 0 ? (
                    <option value="">(none)</option>
                  ) : (
                    tables.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">Limit</span>
                <input
                  className="w-24 rounded-xl border bg-white px-3 py-2 text-sm"
                  type="number"
                  min={1}
                  max={250}
                  value={sampleLimit}
                  onChange={(e) => setSampleLimit(Number(e.target.value))}
                />
              </div>

              <Button variant="secondary" onClick={refreshSample}>
                Refresh Sample
              </Button>
            </div>

            <div className="mt-4 overflow-auto rounded-xl border bg-white">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Table</th>
                    <th className="px-3 py-2 font-semibold">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {tables.map((t) => (
                    <tr key={t} className="border-t">
                      <td className="px-3 py-2 font-mono">{t}</td>
                      <td className="px-3 py-2">{counts?.[t] ?? "-"}</td>
                    </tr>
                  ))}
                  {tables.length === 0 && (
                    <tr className="border-t">
                      <td className="px-3 py-3 text-gray-600" colSpan={2}>
                        No tables returned. Check API base URL + backend.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Sample Rows" right={<Badge status={statusSample} />}>
            <pre className="max-h-[420px] overflow-auto rounded-xl bg-gray-100 p-3 text-xs">
              {pretty(sample)}
            </pre>
          </Card>
        </div>

        <footer className="pb-6 text-center text-xs text-gray-500">
          Next: Leads/Accounts pages (browse + search), then end-user app.
        </footer>
      </div>
    </main>
  );
}