// 표제어 리스트(JSON: [{kanji, level}])를 읽어, Claude로 독음/뜻/한자훈독/예문/freq를
// 채워 Supabase words 테이블에 적재한다. 표제어·급수는 주어진 그대로 쓰고(사실),
// 한국어 뜻·예문은 새로 생성한다.
//
// 진행상황 보존: 같은 (표제어, 급수)가 이미 있으면 그 행의 id를 유지한 채 내용만 갱신
//   → 사용자의 '외운 단어' 표시(progress.word_id)가 그대로 살아 있다.
//
// 사용법:
//   ANTHROPIC_API_KEY=sk-ant-... \
//   SUPABASE_URL=https://xxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   node scripts/annotate-words.mjs [headwords.json 경로] [레벨필터(N5,N3 등)]

import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const MODEL = "claude-opus-4-8"; // 비용↓: "claude-sonnet-4-6"
const BATCH = 25; // 한 호출당 표제어 수
const MAX_TOKENS = 16000;

const apiKey = process.env.ANTHROPIC_API_KEY;
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!apiKey || !url || !key) {
  console.error("ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}
const supabase = createClient(url, key);

const file = process.argv[2] || "words/headwords.json";
const levelFilter = process.argv[3] ? process.argv[3].split(",") : null;
let words = JSON.parse(fs.readFileSync(file, "utf8"));
if (levelFilter) words = words.filter((w) => levelFilter.includes(w.level));

const HANGUL = /[가-힣]/, JP = /[぀-ヿ一-鿿]/, KANA = /[぀-ヿ]/, LATIN = /[A-Za-z]/;
const POS = ["verb", "i-adj", "na-adj", "noun", "adverb", "expression"];

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    words: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          kanji: { type: "string", description: "주어진 표제어 그대로" },
          kana: { type: "string" },
          meaning: { type: "string" },
          pos: { type: "string", enum: POS },
          verbGroup: { type: ["integer", "null"] },
          hanja: {
            type: "array",
            items: {
              type: "object", additionalProperties: false,
              properties: { char: { type: "string" }, reading: { type: "string" } },
              required: ["char", "reading"],
            },
          },
          examples: {
            type: "array",
            items: {
              type: "object", additionalProperties: false,
              properties: { jp: { type: "string" }, kana: { type: "string" }, ko: { type: "string" } },
              required: ["jp", "kana", "ko"],
            },
          },
          freq: { type: "integer", enum: [1, 2, 3] },
        },
        required: ["kanji", "kana", "meaning", "pos", "verbGroup", "hanja", "examples", "freq"],
      },
    },
  },
  required: ["words"],
};

function prompt(level, list) {
  return `당신은 일본어(JLPT) 교재 편집자입니다. 아래는 JLPT ${level} 수준의 표제어 목록입니다.
각 표제어에 대해 학습 정보를 채워 주세요. **표제어(kanji)는 주어진 그대로** 두고, 나머지를 정확히 채웁니다.

규칙:
- 정확성 최우선. 독음(히라가나)·동사군·한자 훈독·예문이 정확해야 합니다.
- meaning과 예문 ko는 **반드시 한국어로만** (영어 단어 금지).
- 동사는 1/2/3군으로 verbGroup, 동사 아니면 null.
- hanja: 각 구성 한자의 한국식 훈독을 "훈 음"으로 ("食"→"먹을 식"). 가나 전용이면 빈 배열.
- examples: 단어마다 2개, ${level}에서 이해 가능한 쉬운 어휘로 jp·kana·ko 모두 채움.
- freq: 그 단어의 사용빈도/중요도 1(핵심)·2(보통)·3(덜 중요).
- 목록의 **모든 표제어를 같은 순서로** 빠짐없이 출력.

표제어 목록(${list.length}개):
${list.map((w) => w.kanji).join("\n")}`;
}

async function annotate(level, list) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL, max_tokens: MAX_TOKENS,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: prompt(level, list) }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = (data.content ?? []).find((b) => b.type === "text")?.text;
  return JSON.parse(text).words;
}

function isValid(w) {
  if (!w || typeof w.kanji !== "string" || typeof w.kana !== "string") return false;
  if (!JP.test(w.kanji) || LATIN.test(w.kanji)) return false;
  if (!KANA.test(w.kana) || LATIN.test(w.kana)) return false;
  if (!HANGUL.test(w.meaning ?? "")) return false;
  if (!POS.includes(w.pos)) return false;
  if (!Array.isArray(w.examples) || w.examples.length === 0) return false;
  for (const ex of w.examples) if (!JP.test(ex?.jp ?? "") || !HANGUL.test(ex?.ko ?? "")) return false;
  return true;
}

// 기존 (표제어,급수) → id (진행상황 보존)
console.log("기존 단어 불러오는 중...");
const existing = new Map();
{
  let from = 0;
  for (;;) {
    const { data, error } = await supabase.from("words").select("id,kanji,level").range(from, from + 999);
    if (error) throw error;
    for (const r of data) existing.set(`${r.kanji}\n${r.level}`, r.id);
    if (data.length < 1000) break;
    from += 1000;
  }
}
console.log("기존:", existing.size, "개 / 처리할 표제어:", words.length, "개");

// 레벨별 배치 처리
const byLevel = {};
for (const w of words) (byLevel[w.level] ??= []).push(w);

let added = 0, updated = 0, failed = 0;
for (const [level, list] of Object.entries(byLevel)) {
  for (let i = 0; i < list.length; i += BATCH) {
    const chunk = list.slice(i, i + BATCH);
    try {
      const ann = await annotate(level, chunk);
      const byKanji = new Map(ann.map((a) => [a.kanji, a]));
      const rows = [];
      for (const { kanji } of chunk) {
        const a = byKanji.get(kanji);
        if (!a || !isValid(a)) { failed++; continue; }
        const exKey = `${kanji}\n${level}`;
        const id = existing.get(exKey) ?? `jlpt-${level}-${randomUUID().slice(0, 8)}`;
        if (existing.has(exKey)) updated++; else added++;
        rows.push({
          id, kanji, kana: a.kana, meaning: a.meaning, level,
          pos: a.pos, verb_group: a.pos === "verb" ? a.verbGroup ?? 1 : null,
          hanja: a.hanja ?? [], examples: a.examples ?? [],
          freq: [1, 2, 3].includes(a.freq) ? a.freq : 2, source: "seed",
        });
      }
      const { error } = await supabase.from("words").upsert(rows, { onConflict: "kanji,level" });
      if (error) throw error;
      console.log(`${level} ${i + chunk.length}/${list.length}  (추가 ${added} / 갱신 ${updated} / 실패 ${failed})`);
    } catch (e) {
      console.error(`배치 실패 (${level} ${i}):`, e.message);
      failed += chunk.length;
    }
  }
}
console.log(`\n완료: 추가 ${added}, 갱신 ${updated}, 실패 ${failed}`);
