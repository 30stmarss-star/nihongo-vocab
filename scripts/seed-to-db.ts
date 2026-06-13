// 손으로 검수한 시드 단어를 Supabase DB로 한 번에 올립니다 (최초 1회).
//
// 사용법:
//   SUPABASE_URL=https://xxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   npx tsx scripts/seed-to-db.ts

import { createClient } from "@supabase/supabase-js";
import { WORDS } from "../src/data/words/index.ts";
import { typeLabel } from "../src/data/types.ts";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.");
  process.exit(1);
}

const supabase = createClient(url, key);

const rows = WORDS.map((w) => ({
  id: w.id,
  kanji: w.kanji,
  kana: w.kana,
  meaning: w.meaning,
  level: w.level,
  pos: w.type.kind,
  verb_group: w.type.kind === "verb" ? w.type.group : null,
  hanja: w.hanja,
  examples: w.examples,
  source: "seed" as const,
}));

console.log(`▶ 시드 ${rows.length}개 업로드 중... (${typeLabel(WORDS[0].type)} 등)`);

const { data, error } = await supabase
  .from("words")
  .upsert(rows, { onConflict: "kanji,level", ignoreDuplicates: true })
  .select("id");

if (error) {
  console.error("실패:", error.message);
  process.exit(1);
}
console.log(`✅ ${data?.length ?? 0}개 반영 완료.`);
