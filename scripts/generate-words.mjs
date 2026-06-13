// 단어 대량 생성 스크립트 (Claude API)
//
// 사용법:
//   ANTHROPIC_API_KEY=sk-... node scripts/generate-words.mjs <레벨> <개수>
//   예) node scripts/generate-words.mjs N3 40
//
// - 우리 앱 스키마(한국어 뜻 · 한국식 한자 훈독 · 동사 군 · 레벨별 예문)에 맞춰 생성
// - 구조화 출력(JSON 스키마)으로 형식을 강제
// - 기존 단어(시드 + 이미 생성된 것)와 겹치지 않게 제외 목록을 넘김
// - 결과를 src/data/words/generated.json 에 누적 저장 (앱이 자동으로 합쳐서 보여줌)

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORDS_DIR = join(__dirname, "..", "src", "data", "words");
const GENERATED = join(WORDS_DIR, "generated.json");

const LEVELS = ["N5", "N4", "N3", "N2"];
const MODEL = "claude-opus-4-8"; // 비용을 낮추려면 "claude-sonnet-4-6"

const level = (process.argv[2] || "").toUpperCase();
const count = Number(process.argv[3] || 30);
if (!LEVELS.includes(level) || !Number.isFinite(count) || count < 1) {
  console.error("사용법: node scripts/generate-words.mjs <N5|N4|N3|N2> <개수>");
  process.exit(1);
}

// 기존 단어(kanji)를 모아 중복 방지용 제외 목록 구성
function existingKanji() {
  const set = new Set();
  for (const f of readdirSync(WORDS_DIR)) {
    if (!f.endsWith(".ts") && f !== "generated.json") continue;
    const text = readFileSync(join(WORDS_DIR, f), "utf8");
    if (f === "generated.json") {
      for (const w of JSON.parse(text || "[]")) set.add(w.kanji);
    } else {
      for (const m of text.matchAll(/kanji:\s*"([^"]+)"/g)) set.add(m[1]);
    }
  }
  return set;
}

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
          kanji: { type: "string", description: "표제어 (가나 전용이면 가나)" },
          kana: { type: "string", description: "히라가나 독음" },
          meaning: { type: "string", description: "한국어 뜻" },
          pos: {
            type: "string",
            enum: ["verb", "i-adj", "na-adj", "noun", "adverb", "expression"],
          },
          verbGroup: {
            type: ["integer", "null"],
            description: "동사면 1/2/3군, 아니면 null",
          },
          hanja: {
            type: "array",
            description: "구성 한자의 한국식 훈독. 가나 단어면 빈 배열",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                char: { type: "string" },
                reading: { type: "string", description: '예: "먹을 식"' },
              },
              required: ["char", "reading"],
            },
          },
          examples: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                jp: { type: "string" },
                kana: { type: "string" },
                ko: { type: "string" },
              },
              required: ["jp", "kana", "ko"],
            },
          },
        },
        required: ["kanji", "kana", "meaning", "pos", "verbGroup", "hanja", "examples"],
      },
    },
  },
  required: ["words"],
};

const exclude = [...existingKanji()];
const prompt = `당신은 일본어(JLPT) 교재 편집자입니다. JLPT ${level} 수준의 학습 단어 ${count}개를 만들어 주세요.

규칙:
- 정확성이 최우선입니다. 독음(히라가나), 동사 군 분류, 한자 훈독, 예문이 모두 정확해야 합니다.
- 동사는 1군(5단)/2군(1단)/3군(불규칙=する·来る류)으로 정확히 분류해 verbGroup에 넣고, 동사가 아니면 verbGroup은 null.
- hanja: 각 구성 한자의 한국식 훈독을 "훈 음" 형태로 ("食"→"먹을 식", "学"→"배울 학"). 가나 전용 단어(예: とても)는 빈 배열.
- meaning: 자연스러운 한국어 뜻.
- examples: 각 단어마다 2개. 해당 학습자 레벨(${level})에서 이해 가능한 쉬운 어휘로만 구성하고, jp(한자 포함)·kana(히라가나 독음)·ko(한국어 번역)를 모두 채움.
- 품사는 다양하게 섞되(동사/형용사/명사/부사/표현) ${level} 빈출 단어 위주로.
- 아래 '이미 있는 단어'와 표제어가 겹치지 않게 새로운 단어만 생성:
${exclude.join(", ")}`;

const client = new Anthropic(); // ANTHROPIC_API_KEY 환경변수 사용

console.log(`▶ ${level} 단어 ${count}개 생성 중... (기존 ${exclude.length}개 제외)`);

const res = await client.messages.create({
  model: MODEL,
  max_tokens: 16000,
  // 사고 끔(구조화 출력으로 형식 강제). 품질을 더 원하면 thinking: { type: "adaptive" } 추가.
  output_config: { format: { type: "json_schema", schema: SCHEMA } },
  messages: [{ role: "user", content: prompt }],
});

const textBlock = res.content.find((b) => b.type === "text");
if (!textBlock) {
  console.error("응답에 텍스트가 없습니다:", JSON.stringify(res, null, 2));
  process.exit(1);
}
const { words } = JSON.parse(textBlock.text);

// 우리 Word 형식으로 변환
function slug(s) {
  return s.replace(/[^A-Za-z0-9]+/g, "").slice(0, 8) || "x";
}
const mapped = words.map((w, i) => ({
  id: `gen-${level}-${slug(w.kana)}-${i}`,
  kanji: w.kanji,
  kana: w.kana,
  meaning: w.meaning,
  level,
  type:
    w.pos === "verb"
      ? { kind: "verb", group: w.verbGroup ?? 1 }
      : { kind: w.pos },
  hanja: w.hanja ?? [],
  examples: w.examples ?? [],
}));

// 기존 generated.json에 누적 + 중복(kanji) 제거
const prev = JSON.parse(readFileSync(GENERATED, "utf8") || "[]");
const haveKanji = new Set([...existingKanji()]);
const added = mapped.filter((w) => {
  if (haveKanji.has(w.kanji)) return false;
  haveKanji.add(w.kanji);
  return true;
});

const out = [...prev, ...added];
writeFileSync(GENERATED, JSON.stringify(out, null, 2) + "\n");

console.log(`✅ ${added.length}개 추가 (generated.json 누적 ${out.length}개)`);
if (added.length < mapped.length) {
  console.log(`   (${mapped.length - added.length}개는 기존과 겹쳐 제외)`);
}
console.log(`사용 토큰: 입력 ${res.usage.input_tokens} / 출력 ${res.usage.output_tokens}`);
