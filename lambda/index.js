"use strict";
const BUILD_ID = "sf-leads-v1-2026-02-26";
const mysql = require("mysql2/promise");
const net = require("net");

const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");

// ================= ENV =================
const DB_SECRET_ARN = process.env.DB_SECRET_ARN;
const BUCKET = process.env.BUCKET;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

const AWS_REGION =
  process.env.APP_REGION ||
  process.env.AWS_REGION ||
  process.env.AWS_DEFAULT_REGION ||
  "us-east-1";

let cachedDbConfig = null;

// ================= UTIL =================
function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      // You can tighten this later; for now this keeps local + vercel + SF happy.
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "content-type,x-admin-token",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

function getMethodAndPath(event) {
  const method = event.requestContext?.http?.method || event.httpMethod || "GET";
  const path = event.rawPath || event.path || "/";
  return { method, path };
}

function parseJsonBody(event) {
  if (!event?.body) return {};
  if (typeof event.body === "object") return event.body;
  try {
    return JSON.parse(event.body);
  } catch {
    return {};
  }
}

function requireAdmin(event) {
  const token =
    event.headers?.["x-admin-token"] ||
    event.headers?.["X-Admin-Token"] ||
    event.headers?.["x-admin-token".toLowerCase()];

  if (!ADMIN_TOKEN) {
    const err = new Error("ADMIN_TOKEN is not set");
    err.statusCode = 500;
    throw err;
  }
  if (token !== ADMIN_TOKEN) {
    const err = new Error("Unauthorized");
    err.statusCode = 401;
    throw err;
  }
}

function safeTableName(t) {
  return /^[A-Za-z0-9_]+$/.test(t);
}

async function streamToString(stream) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (c) => chunks.push(c));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
  });
}

// ================= DB =================
async function getDbConfig() {
  if (cachedDbConfig) return cachedDbConfig;

  if (!DB_SECRET_ARN) {
    throw new Error("DB_SECRET_ARN env var is not set");
  }

  const sm = new SecretsManagerClient({ region: AWS_REGION });
  const resp = await sm.send(
    new GetSecretValueCommand({ SecretId: DB_SECRET_ARN })
  );

  const secretString =
    resp.SecretString ||
    Buffer.from(resp.SecretBinary || "", "base64").toString("utf-8");

  const cfg = JSON.parse(secretString);

  cachedDbConfig = {
    host: cfg.host,
    user: cfg.username,
    password: cfg.password,
    database: cfg.dbname,
    port: cfg.port || 3306,
  };

  return cachedDbConfig;
}

async function withDb(fn) {
  const cfg = await getDbConfig();

  const conn = await mysql.createConnection({
    host: cfg.host,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    port: cfg.port,
    connectTimeout: 5000,
  });

  try {
    return await fn(conn);
  } finally {
    await conn.end();
  }
}

// ================= S3 =================
async function getLatestKey(bucket, prefix) {
  const s3 = new S3Client({ region: AWS_REGION });

  let token;
  let latest = null;

  do {
    const resp = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
      })
    );

    for (const o of resp.Contents || []) {
      if (!o.Key) continue;
      if (!latest || (o.LastModified && o.LastModified > latest.LastModified)) {
        latest = o;
      }
    }

    token = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (token);

  return latest?.Key || null;
}

// ================= FEATURES =================
async function tcpCheck() {
  const cfg = await getDbConfig();

  const result = await new Promise((resolve) => {
    const socket = new net.Socket();
    const start = Date.now();
    socket.setTimeout(3000);

    socket
      .once("connect", () => {
        const ms = Date.now() - start;
        socket.destroy();
        resolve({ ok: true, connected: true, ms });
      })
      .once("timeout", () => {
        socket.destroy();
        resolve({ ok: false, connected: false, error: "timeout" });
      })
      .once("error", (err) => {
        socket.destroy();
        resolve({
          ok: false,
          connected: false,
          error: err.code || err.message,
        });
      })
      .connect(cfg.port || 3306, cfg.host);
  });

  return {
    target: { host: cfg.host, port: cfg.port || 3306 },
    result,
  };
}

async function listTables() {
  return await withDb(async (conn) => {
    const [rows] = await conn.query("SHOW TABLES");
    return rows.map((r) => Object.values(r)[0]);
  });
}

async function tableCounts() {
  return await withDb(async (conn) => {
    const [rows] = await conn.query("SHOW TABLES");
    const tableNames = rows.map((r) => Object.values(r)[0]);

    const out = {};
    for (const t of tableNames) {
      const [r] = await conn.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
      out[t] = r[0]?.n ?? 0;
    }
    return out;
  });
}

// ---- Migrate: ensure tables + columns exist
async function migrateSchema() {
  return await withDb(async (conn) => {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS leads (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        external_id VARCHAR(255) NOT NULL UNIQUE,
        first_name VARCHAR(80),
        last_name VARCHAR(80),
        company VARCHAR(255),
        title VARCHAR(255),
        lead_source VARCHAR(255),
        status VARCHAR(255),
        description TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS accounts (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        external_id VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Add sync/link columns safely (MySQL 8 supports ADD COLUMN IF NOT EXISTS)
    // If your engine ever changes, this is still a good “best effort”.
    const alters = [
      `ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_converted TINYINT(1) DEFAULT 0`,
      `ALTER TABLE leads ADD COLUMN IF NOT EXISTS converted_account_id VARCHAR(255)`,
      `ALTER TABLE leads ADD COLUMN IF NOT EXISTS account_external_id VARCHAR(255)`,
    ];

    for (const sql of alters) {
      try {
        await conn.execute(sql);
      } catch (e) {
        // If the server/version doesn't support IF NOT EXISTS or column exists already,
        // don't fail your whole migration.
        // We'll just continue.
      }
    }

    return { ok: true };
  });
}

// ---- Seed leads from latest AppFlow JSONL
async function seedLeadsFromS3() {
  if (!BUCKET) throw new Error("BUCKET env var is not set");

  const prefix = "salesforce/raw/leads/";
  const key = await getLatestKey(BUCKET, prefix);
  if (!key) return { ok: false, error: "No lead export files found", prefix };

  const s3 = new S3Client({ region: AWS_REGION });
  const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const text = await streamToString(obj.Body);

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

  let inserted = 0,
    updated = 0,
    skipped = 0;

  await withDb(async (conn) => {
    for (const line of lines) {
      let r;
      try {
        r = JSON.parse(line);
      } catch {
        skipped++;
        continue;
      }

      const externalId = (r.Id || r.external_id || "").toString().trim();
      if (!externalId) {
        skipped++;
        continue;
      }

      const firstName = (r.FirstName || r.first_name || "").toString().trim();
      const lastName = (r.LastName || r.last_name || "").toString().trim();
      const company = (r.Company || r.company || "").toString().trim();
      const title = (r.Title || r.title || "").toString().trim();
      const leadSource = (r.LeadSource || r.lead_source || "").toString().trim();
      const status = (r.Status || r.status || "").toString().trim();
      const description = (r.Description || r.description || "").toString().trim();

      const isConvertedRaw = r.IsConverted ?? r.is_converted ?? 0;
      const isConverted =
        isConvertedRaw === true ||
        isConvertedRaw === 1 ||
        isConvertedRaw === "true" ||
        isConvertedRaw === "1"
          ? 1
          : 0;

      const convertedAccountId = (r.ConvertedAccountId || r.converted_account_id || "")
        .toString()
        .trim();

      const [res] = await conn.execute(
        `
        INSERT INTO leads
          (external_id, first_name, last_name, company, title, lead_source, status, description, is_converted, converted_account_id)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          first_name = VALUES(first_name),
          last_name = VALUES(last_name),
          company = VALUES(company),
          title = VALUES(title),
          lead_source = VALUES(lead_source),
          status = VALUES(status),
          description = VALUES(description),
          is_converted = VALUES(is_converted),
          converted_account_id = VALUES(converted_account_id)
        `,
        [
          externalId,
          firstName,
          lastName,
          company,
          title,
          leadSource,
          status,
          description,
          isConverted,
          convertedAccountId || null,
        ]
      );

      // affectedRows: 1 insert, 2 update (for ON DUP)
      if (res.affectedRows === 1) inserted++;
      else updated++;
    }
  });

  return { ok: true, bucket: BUCKET, key, inserted, updated, skipped, total: lines.length };
}

// ---- Seed accounts from latest AppFlow JSONL
async function seedAccountsFromS3() {
  if (!BUCKET) throw new Error("BUCKET env var is not set");

  const prefix = "salesforce/raw/accounts/";
  const key = await getLatestKey(BUCKET, prefix);
  if (!key) return { ok: false, error: "No account export files found", prefix };

  const s3 = new S3Client({ region: AWS_REGION });
  const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const text = await streamToString(obj.Body);

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

  let inserted = 0,
    updated = 0,
    skipped = 0;

  await withDb(async (conn) => {
    for (const line of lines) {
      let r;
      try {
        r = JSON.parse(line);
      } catch {
        skipped++;
        continue;
      }

      const externalId = (r.Id || r.external_id || "").toString().trim();
      const name = (r.Name || r.name || "").toString().trim();
      const description = (r.Description || r.description || "").toString().trim();

      if (!externalId || !name) {
        skipped++;
        continue;
      }

      const [res] = await conn.execute(
        `
        INSERT INTO accounts (external_id, name, description)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          description = VALUES(description)
        `,
        [externalId, name, description]
      );

      if (res.affectedRows === 1) inserted++;
      else updated++;
    }
  });

  return { ok: true, bucket: BUCKET, key, inserted, updated, skipped, total: lines.length };
}

// ---- Link leads to accounts (simple: match company to account name)
async function linkLeadsToAccounts() {
  return await withDb(async (conn) => {
    // Best effort: link by exact match on company -> accounts.name
    const [res] = await conn.execute(`
      UPDATE leads l
      JOIN accounts a ON a.name = l.company
      SET l.account_external_id = a.external_id
      WHERE (l.account_external_id IS NULL OR l.account_external_id = '')
    `);

    return { ok: true, linked: res.affectedRows ?? 0 };
  });
}

// ---- Link converted leads using converted_account_id (if present)
async function linkConvertedLeadsToAccounts() {
  return await withDb(async (conn) => {
    // If leads.converted_account_id is filled from Salesforce, link to accounts.external_id
    const [res] = await conn.execute(`
      UPDATE leads l
      JOIN accounts a ON a.external_id = l.converted_account_id
      SET l.account_external_id = a.external_id
      WHERE l.is_converted = 1
        AND l.converted_account_id IS NOT NULL
        AND l.converted_account_id <> ''
    `);

    return { ok: true, linked: res.affectedRows ?? 0 };
  });
}

// ---- Import CSV from S3 into table (expects header row)
function parseCsvLine(line) {
  // Minimal CSV parser: handles commas + quotes reasonably for demo CSVs.
  // If you later want RFC-complete parsing, we can add a library.
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') {
      cur += '"';
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

async function importCsvFromS3({ key, table }) {
  if (!BUCKET) throw new Error("BUCKET env var is not set");
  if (!key) throw new Error("key is required");
  if (!table) throw new Error("table is required");

  if (!["leads", "accounts"].includes(table)) {
    throw new Error("table must be leads or accounts");
  }

  const s3 = new S3Client({ region: AWS_REGION });
  const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const text = await streamToString(obj.Body);

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { ok: true, inserted: 0, updated: 0, skipped: 0, total: 0 };

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const rows = lines.slice(1);

  let inserted = 0,
    updated = 0,
    skipped = 0;

  await withDb(async (conn) => {
    for (const line of rows) {
      const vals = parseCsvLine(line);
      const rec = {};
      headers.forEach((h, idx) => (rec[h] = vals[idx] ?? ""));

      if (table === "accounts") {
        const externalId = (rec.external_id || "").toString().trim();
        const name = (rec.name || "").toString().trim();
        const description = (rec.description || "").toString().trim();

        if (!externalId || !name) {
          skipped++;
          continue;
        }

        const [res] = await conn.execute(
          `
          INSERT INTO accounts (external_id, name, description)
          VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            description = VALUES(description)
          `,
          [externalId, name, description]
        );

        if (res.affectedRows === 1) inserted++;
        else updated++;
        continue;
      }

      // leads
      const externalId = (rec.external_id || "").toString().trim();
      if (!externalId) {
        skipped++;
        continue;
      }

      const firstName = (rec.first_name || "").toString().trim();
      const lastName = (rec.last_name || "").toString().trim();
      const company = (rec.company || "").toString().trim();
      const title = (rec.title || "").toString().trim();
      const leadSource = (rec.lead_source || "").toString().trim();
      const status = (rec.status || "").toString().trim();
      const description = (rec.description || "").toString().trim();

      const isConverted =
        rec.is_converted === "1" || rec.is_converted === "true" ? 1 : 0;

      const convertedAccountId = (rec.converted_account_id || "").toString().trim();
      const accountExternalId = (rec.account_external_id || "").toString().trim();

      const [res] = await conn.execute(
        `
        INSERT INTO leads
          (external_id, first_name, last_name, company, title, lead_source, status, description, is_converted, converted_account_id, account_external_id)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          first_name = VALUES(first_name),
          last_name = VALUES(last_name),
          company = VALUES(company),
          title = VALUES(title),
          lead_source = VALUES(lead_source),
          status = VALUES(status),
          description = VALUES(description),
          is_converted = VALUES(is_converted),
          converted_account_id = VALUES(converted_account_id),
          account_external_id = VALUES(account_external_id)
        `,
        [
          externalId,
          firstName,
          lastName,
          company,
          title,
          leadSource,
          status,
          description,
          isConverted,
          convertedAccountId || null,
          accountExternalId || null,
        ]
      );

      if (res.affectedRows === 1) inserted++;
      else updated++;
    }
  });

  return { ok: true, bucket: BUCKET, key, inserted, updated, skipped, total: rows.length };
}

// ================= HANDLER =================
exports.handler = async (event) => {
  try {
    const { method, path } = getMethodAndPath(event);
    const qs = event.queryStringParameters || {};

    if (method === "OPTIONS") return json(200, { ok: true });

    // -------- health
    if (method === "GET" && path === "/") {
      return json(200, { ok: true, message: "API is running" });
    }

    if (method === "GET" && path === "/") {
  return json(200, { ok: true, build: BUILD_ID });
}

    // -------- tcp check
    if (method === "GET" && path === "/tcp-check") {
      return json(200, await tcpCheck());
    }

    // -------- db inspection
    if (method === "GET" && path === "/db/tables") {
      return json(200, { ok: true, tables: await listTables() });
    }

    if (method === "GET" && path === "/db/counts") {
      return json(200, { ok: true, counts: await tableCounts() });
    }

    // GET /db/sample?table=leads&limit=25
    if (method === "GET" && path === "/db/sample") {
      const table = (qs.table || "").toString().trim();
      const limit = Math.max(1, Math.min(250, parseInt(qs.limit || "25", 10) || 25));

      if (!table) return json(400, { error: "table is required" });
      if (!safeTableName(table)) return json(400, { error: "invalid table name" });

      const rows = await withDb(async (conn) => {
        const [r] = await conn.query(`SELECT * FROM \`${table}\` LIMIT ${limit}`);
        return r;
      });

      return json(200, { ok: true, table, limit, rows });
    }

    // -------- upload-url
    if (method === "GET" && path === "/upload-url") {
      const key = (qs.key || "").toString().trim();
      const contentType = (qs.contentType || "application/octet-stream").toString();

      if (!BUCKET) return json(500, { error: "BUCKET env var is not set" });
      if (!key) return json(400, { error: "key is required" });

      const s3 = new S3Client({ region: AWS_REGION });

      const command = new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        ContentType: contentType,
      });

      const url = await getSignedUrl(s3, command, { expiresIn: 300 });

      return json(200, {
        ok: true,
        bucket: BUCKET,
        key,
        url,
        expiresInSeconds: 300,
      });
    }

    // -------- migrate
    if (method === "POST" && path === "/migrate") {
      requireAdmin(event);
      const out = await migrateSchema();
      return json(200, out);
    }

    // -------- items (simple test write)
    if (method === "POST" && path === "/items") {
      const body = parseJsonBody(event);
      const name = (body.name || "").toString().trim();
      const notes = (body.notes || "").toString().trim();

      if (!name) return json(400, { error: "name is required" });

      const item = await withDb(async (conn) => {
        await conn.execute(`
          CREATE TABLE IF NOT EXISTS items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        const [res] = await conn.execute(
          "INSERT INTO items (name, notes) VALUES (?, ?)",
          [name, notes]
        );

        const [rows] = await conn.execute("SELECT * FROM items WHERE id = ?", [
          res.insertId,
        ]);

        return rows[0];
      });

      return json(200, { ok: true, item });
    }

    // -------- seed leads/accounts
    if (method === "POST" && path === "/seed/leads") {
      requireAdmin(event);
      const out = await seedLeadsFromS3();
      return json(200, out);
    }

    if (method === "POST" && path === "/seed/accounts") {
      requireAdmin(event);
      const out = await seedAccountsFromS3();
      return json(200, out);
    }

    // -------- link endpoints (you already have routes for these)
    if (method === "POST" && path === "/link/leads-to-accounts") {
      requireAdmin(event);
      const out = await linkLeadsToAccounts();
      return json(200, out);
    }

    if (method === "POST" && path === "/link/leads-to-accounts-converted") {
      requireAdmin(event);
      const out = await linkConvertedLeadsToAccounts();
      return json(200, out);
    }

    // -------- import CSV
    if (method === "POST" && path === "/import/csv") {
      requireAdmin(event);
      const body = parseJsonBody(event);
      const out = await importCsvFromS3({ key: body.key, table: body.table });
      return json(200, out);
    }

    // ✅ NEW: Salesforce pull endpoint
    // GET /sf/leads?limit=100
    if (method === "GET" && path === "/sf/leads") {
      requireAdmin(event);

      const limit = Math.max(1, Math.min(500, parseInt(qs.limit || "100", 10) || 100));

      const rows = await withDb(async (conn) => {
        const [r] = await conn.query(
          `
          SELECT
            external_id,
            first_name,
            last_name,
            company,
            title,
            lead_source,
            status,
            description,
            is_converted,
            converted_account_id,
            account_external_id,
            updated_at
          FROM leads
          ORDER BY updated_at DESC
          LIMIT ?
          `,
          [limit]
        );
        return r;
      });

      return json(200, { ok: true, count: rows.length, data: rows });
    }

    // -------- default
    return json(404, { error: "Not Found", method, path });
  } catch (err) {
    const statusCode = err?.statusCode || 500;
    return json(statusCode, {
      error: statusCode === 500 ? "Internal Server Error" : err.message,
      details: statusCode === 500 ? (err?.message || String(err)) : undefined,
    });
  }
};