// Supabase 스키마 변경을 CLI로 적용한다.
//
//   node scripts/run-sql.mjs supabase/migrations/xxx.sql
//   node scripts/run-sql.mjs --check      # 필요한 테이블이 다 있는지 확인
//
// 토큰은 .env.local 의 SUPABASE_ACCESS_TOKEN (깃에 올라가지 않는 파일).
// 대시보드에서 SQL을 손으로 붙여넣던 일을 대신한다.

import { readFileSync } from "node:fs";

const PROJECT = "auvcrexjkoxvymzytlxp";
const API = `https://api.supabase.com/v1/projects/${PROJECT}/database/query`;

function token() {
  const line = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("SUPABASE_ACCESS_TOKEN="));
  const t = line?.slice("SUPABASE_ACCESS_TOKEN=".length).trim().replace(/^["']|["']$/g, "");
  if (!t) throw new Error(".env.local 에 SUPABASE_ACCESS_TOKEN 이 없습니다");
  return t;
}

async function run(query) {
  const res = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const args = process.argv.slice(2);

if (args[0] === "--check") {
  const rows = await run(
    `select table_name from information_schema.tables
     where table_schema = 'public' order by table_name`
  );
  const have = new Set(rows.map((r) => r.table_name));
  const need = [
    "words",
    "progress",
    "user_settings",
    "confusable_progress",
    "scanned_queue",
    "daily_activity",
    "daily_plan",
    "wordbook",
    "speaking_log",
  ];
  for (const t of need) console.log(`${have.has(t) ? "OK  " : "없음"} ${t}`);
  const extra = [...have].filter((t) => !need.includes(t));
  if (extra.length) console.log("(그 외:", extra.join(", ") + ")");
} else if (args.length) {
  for (const file of args) {
    process.stdout.write(`${file} … `);
    await run(readFileSync(file, "utf8"));
    console.log("적용됨");
  }
} else {
  console.log("사용법: node scripts/run-sql.mjs <파일.sql>...  |  --check");
}
