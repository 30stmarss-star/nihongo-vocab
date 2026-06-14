// N1 단어장 PDF의 텍스트 레이어(루비 구조)를 Claude로 파싱해 표제어를 추출한다.
// 교재 레이아웃: 한자와 후리가나가 줄마다 갈라져 있고, 마지막에 한국어 뜻이 온다.
//   예) "潤\nうるお\nう 축축해지다"  → 潤う
//       "契\nけい\n約\nやく\n계약"   → 契約
// 어휘 섹션(한자읽기/문맥규정/유의어/용법, PDF 3~29쪽)만 처리하고 문법(30쪽~)은 제외.
// 결과: [{kanji, level:"N1"}] 를 words/headwords-n1.json 에 저장.
//
// 사용법: ANTHROPIC_API_KEY=... node scripts/extract-n1.mjs

import fs from "fs";
import { PDFParse } from "pdf-parse";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error("ANTHROPIC_API_KEY 필요"); process.exit(1); }

const MODEL = "claude-opus-4-8";
const PDF = "words/일단합격JLPT완벽대비N1-단어장.pdf";
const VOCAB_PAGES = [3, 29]; // 단어 체크북 범위(포함)

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    words: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { kanji: { type: "string", description: "사전형 표제어" } },
        required: ["kanji"],
      },
    },
  },
  required: ["words"],
};

function prompt(pageText) {
  return `다음은 JLPT N1 단어장(한국 교재)의 한 페이지를 PDF에서 추출한 텍스트입니다.
레이아웃이 깨져 있습니다: 각 단어의 한자와 후리가나(독음)가 줄마다 번갈아 나오고, 마지막에 한국어 뜻이 붙습니다.

예시 해석:
- "潤\\nうるお\\nう 축축해지다" → 표제어는 「潤う」
- "契\\nけい\\n約\\nやく\\n계약" → 표제어는 「契約」
- "フォローする 보조하다" → 표제어는 「フォローする」(가타카나)
- "やんわり 부드럽게" → 표제어는 「やんわり」(가나)
- "(歴\\nれき\\n史\\nし\\n)上\\nじょう\\n ~상" → 표제어는 「歴史上」(괄호는 문맥, 합쳐서)
- "(夢\\nゆめ\\nが)かなう (꿈이) 이루어지다" → 표제어는 「かなう」(괄호 속 文맥 제외, 핵심 단어만)

규칙:
- 각 어휘 항목에서 **일본어 표제어(사전형)** 만 추출. 후리가나로 한자를 올바르게 읽어 정확한 단어를 복원하세요.
- 동사·형용사는 사전형(끝을 う단/い 등)으로. 「~する」가 붙는 명사는 명사만 (예 "加工する"→「加工」, 단 "フォローする"처럼 가타카나+する는 그대로).
- 페이지 번호(숫자만), 섹션 제목(한자 읽기/문맥 규정/유의어/용법/N·1·합·격 등), 한국어만 있는 줄은 제외.
- 접두/접미만 남는 순수 조각(当~, 猛~ 등 단독 의미 없는 것)은 제외.
- 페이지에 등장하는 **모든 어휘를 등장 순서대로** 빠짐없이.

페이지 텍스트:
"""
${pageText}
"""`;
}

async function extractPage(pageText) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 8000,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: prompt(pageText) }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = (data.content ?? []).find((b) => b.type === "text")?.text;
  return JSON.parse(text).words.map((w) => w.kanji);
}

const buf = fs.readFileSync(PDF);
const p = new PDFParse({ data: buf });
const r = await p.getText();
await p.destroy();
const parts = r.text.split(/-- (\d+) of 64 --/);
const pageMap = {};
for (let i = 1; i < parts.length; i += 2) pageMap[parts[i]] = parts[i + 1];

const JP = /[぀-ヿ一-鿿]/, LATIN = /[A-Za-z]/, CTRL = /[\x00-\x1f\x7f]/;
const seen = new Set();
const out = [];
for (let pg = VOCAB_PAGES[0]; pg <= VOCAB_PAGES[1]; pg++) {
  const txt = (pageMap[String(pg)] ?? "").trim();
  if (!txt) continue;
  try {
    const words = await extractPage(txt);
    let kept = 0;
    for (let k of words) {
      k = k.replace(CTRL, "").trim();
      if (!k || !JP.test(k) || LATIN.test(k.replace(/[ァ-ヿ]/g, ""))) {
        // 가타카나(+する)는 허용하되, 라틴 알파벳은 제외
      }
      if (!k || CTRL.test(k)) continue;
      if (LATIN.test(k)) continue;
      if (!JP.test(k)) continue;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ kanji: k, level: "N1" });
      kept++;
    }
    console.log(`p${pg}: ${words.length}개 추출 → ${kept}개 신규 (누적 ${out.length})`);
  } catch (e) {
    console.error(`p${pg} 실패:`, e.message);
  }
}

fs.writeFileSync("words/headwords-n1.json", JSON.stringify(out), "utf8");
console.log(`\n완료: N1 표제어 ${out.length}개 → words/headwords-n1.json`);
