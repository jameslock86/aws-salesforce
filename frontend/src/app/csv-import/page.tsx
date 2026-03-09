"use client";

import { useMemo, useState } from "react";

const BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");
const ADMIN_TOKEN = process.env.NEXT_PUBLIC_ADMIN_TOKEN || "";

function mustEnv() {
  if (!BASE) throw new Error("Missing NEXT_PUBLIC_API_BASE_URL");
  if (!ADMIN_TOKEN) throw new Error("Missing NEXT_PUBLIC_ADMIN_TOKEN");
}

async function api<T = any>(
  path: string,
  init?: RequestInit,
  admin = false
): Promise<T> {
  mustEnv();

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      ...(admin ? { "x-admin-token": ADMIN_TOKEN } : {}),
    },
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(
      data?.error || data?.details || data?.message || `HTTP ${res.status}`
    );
  }
  return data;
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function sampleCsvFor(table: "leads" | "accounts") {
  if (table === "accounts") {
    return [
      "external_id,name,description",
      "001-demo-acct-001,Acme Corp,Sample account imported from CSV",
      "001-demo-acct-002,Globex Inc,Another sample account row",
      "",
    ].join("\n");
  }

  // leads
  return [
    "external_id,first_name,last_name,company,title,lead_source,status,description,is_converted,converted_account_id,account_external_id",
    "00Q-demo-lead-001,Bertha,Boxer,Farmers Coop. of Florida,Director of Vendor Relations,Web,Working - Contacted,Sample lead row,0,,",
    "00Q-demo-lead-002,Phyllis,Cotton,Abbott Insurance,VP Sales,Phone Inquiry,Open - Not Contacted,Second sample row,1,001-demo-acct-001,001-demo-acct-001",
    "",
  ].join("\n");
}

export default function CsvImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [table, setTable] = useState<"leads" | "accounts">("leads");
  const [status, setStatus] = useState<
    "idle" | "uploading" | "importing" | "done" | "error"
  >("idle");
  const [out, setOut] = useState<any>(null);

  const apiBase = useMemo(() => BASE, []);

  async function run() {
    setOut(null);

    try {
      if (!file) throw new Error("Pick a CSV file first");

      setStatus("uploading");

      // 1) Get presigned URL for upload
      const safeName = file.name.replace(/\s+/g, "_");
      const key = `uploads/csv/${table}/${Date.now()}-${safeName}`;

      const presign = await api<{ ok: boolean; url: string; key: string }>(
        `/upload-url?key=${encodeURIComponent(key)}&contentType=${encodeURIComponent(
          file.type || "text/csv"
        )}`,
        { method: "GET" },
        false
      );

      // 2) Upload to S3 directly
      // const put = await fetch(presign.url, {
      //   method: "PUT",
      //   headers: { "Content-Type": file.type || "text/csv" },
      //   body: file,
      // });
      const put = await fetch(presign.url, {
        method: "PUT",
        body: file,
        });

      if (!put.ok) throw new Error(`S3 upload failed (HTTP ${put.status})`);

      setStatus("importing");

      // 3) Import into DB from S3 key
      const result = await api(
        `/import/csv`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: presign.key, table }),
        },
        true
      );

      setOut(result);
      setStatus("done");
    } catch (e: any) {
      setOut({ error: e?.message || String(e) });
      setStatus("error");
    }
  }

  function downloadSample() {
    const csv = sampleCsvFor(table);
    const filename = table === "accounts" ? "sample-accounts.csv" : "sample-leads.csv";
    downloadText(filename, csv);
  }

  return (
    <main className="min-h-screen bg-gray-50 p-5">
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="rounded-2xl border bg-white p-5 shadow-sm space-y-2">
          <h1 className="text-2xl font-bold">CSV → Database Import</h1>
          <p className="text-sm text-gray-600">
            Upload a CSV and import it into RDS (upload to S3 via presigned URL, then import).
          </p>
          <div className="text-xs text-gray-600">
            API base:{" "}
            <span className="font-mono text-gray-900">
              {apiBase || "(missing)"}
            </span>
          </div>
          <div>
           <a
              className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-200"
              href="/"
            >
              Back to dashboard
            </a>
            </div>
        </header>

        <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold">Import table</label>
            <select
              className="w-full rounded-xl border bg-white px-3 py-2 text-sm"
              value={table}
              onChange={(e) => setTable(e.target.value as any)}
            >
              <option value="leads">leads</option>
              <option value="accounts">accounts</option>
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-200"
              onClick={downloadSample}
              type="button"
            >
              Download sample CSV
            </button>

            <a
              className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-200"
              href="/"
            >
              Back to dashboard
            </a>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold">CSV file</label>
            <input
              className="w-full rounded-xl border bg-white px-3 py-2 text-sm"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>

          <button
            className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-black/90 disabled:opacity-50"
            onClick={run}
            disabled={!file || status === "uploading" || status === "importing"}
          >
            {status === "uploading"
              ? "Uploading to S3…"
              : status === "importing"
              ? "Importing to DB…"
              : "Upload & Import"}
          </button>

          <div className="rounded-xl bg-gray-100 p-3 text-xs font-mono overflow-auto max-h-80">
            {out ? JSON.stringify(out, null, 2) : "Output will show here…"}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-2">
          <h2 className="text-lg font-semibold">Expected CSV Headers</h2>

          {table === "accounts" ? (
            <div className="font-mono text-xs">
              external_id, name, description
            </div>
          ) : (
            <div className="font-mono text-xs">
              external_id, first_name, last_name, company, title, lead_source,
              status, description, is_converted, converted_account_id,
              account_external_id
            </div>
          )}

          <p className="text-xs text-gray-600">
            Tip: download the sample, edit it, then import.
          </p>
        </div>
      </div>
    </main>
  );
}