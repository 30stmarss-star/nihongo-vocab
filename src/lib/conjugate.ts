import type { Word } from "../data/types";

/**
 * 사전형(調べる) 하나로 문장에 실제로 나오는 활용형(調べます·調べました·調べて…)을 펼친다.
 * 예문 속 단어를 탭할 수 있게 하려면 이게 필요하다 — 문장은 기본형으로 나오지 않으니까.
 *
 * 완전한 활용기가 아니라 '문장에서 자주 보이는 꼴'만 만든다. 못 만든 형태는
 * 그냥 하이라이트가 안 될 뿐이라, 틀린 매칭보다 안전한 쪽으로 기울였다.
 */

/** 5단동사: 끝 가나별 어간 변화 + 음편(て/た형) */
const GODAN: Record<string, { a: string; i: string; e: string; o: string; te: string; ta: string }> = {
  う: { a: "わ", i: "い", e: "え", o: "お", te: "って", ta: "った" },
  つ: { a: "た", i: "ち", e: "て", o: "と", te: "って", ta: "った" },
  る: { a: "ら", i: "り", e: "れ", o: "ろ", te: "って", ta: "った" },
  む: { a: "ま", i: "み", e: "め", o: "も", te: "んで", ta: "んだ" },
  ぶ: { a: "ば", i: "び", e: "べ", o: "ぼ", te: "んで", ta: "んだ" },
  ぬ: { a: "な", i: "に", e: "ね", o: "の", te: "んで", ta: "んだ" },
  く: { a: "か", i: "き", e: "け", o: "こ", te: "いて", ta: "いた" },
  ぐ: { a: "が", i: "ぎ", e: "げ", o: "ご", te: "いで", ta: "いだ" },
  す: { a: "さ", i: "し", e: "せ", o: "そ", te: "して", ta: "した" },
};

/** ます형 어간에 붙는 정중체 어미 */
const POLITE = ["ます", "ました", "ません", "ませんでした", "ましょう", "まして", "たい", "たかった"];
/** て형 뒤에 자주 붙는 꼴 (진행·완료) */
const AFTER_TE = ["", "いる", "います", "いました", "いない", "いた", "ください", "から", "も"];

function pushAll(out: Set<string>, base: string, tails: string[]) {
  for (const t of tails) out.add(base + t);
}

/** 5단동사(1군) 활용형 */
function godanForms(dict: string): string[] {
  const last = dict.slice(-1);
  const row = GODAN[last];
  if (!row) return [dict];
  const stem = dict.slice(0, -1);
  const out = new Set<string>([dict]);
  pushAll(out, stem + row.i, POLITE);
  pushAll(out, stem + row.a, ["ない", "なかった", "なくて", "ず", "れる", "せる"]);
  pushAll(out, stem + row.e, ["ば", "る", "ます", "ました", "ない"]); // 가능형
  out.add(stem + row.o + "う"); // 의지형
  for (const t of AFTER_TE) out.add(stem + row.te + t);
  pushAll(out, stem + row.ta, ["", "ら", "り"]);
  return [...out];
}

/** 1단동사(2군) 활용형 */
function ichidanForms(dict: string): string[] {
  if (!dict.endsWith("る")) return [dict];
  const stem = dict.slice(0, -1);
  const out = new Set<string>([dict]);
  pushAll(out, stem, POLITE);
  pushAll(out, stem, ["ない", "なかった", "なくて", "た", "たら", "たり", "れば", "よう", "られる", "させる", "ろ", "ず"]);
  for (const t of AFTER_TE) out.add(stem + "て" + t);
  return [...out];
}

/** 불규칙(3군): する / 来る 계열 */
function irregularForms(dict: string): string[] {
  const out = new Set<string>([dict]);
  if (dict.endsWith("する")) {
    const stem = dict.slice(0, -2);
    pushAll(out, stem + "し", [...POLITE, "ない", "なかった", "た", "て", "ています", "ている", "よう"]);
    out.add(stem + "できる");
    out.add(stem + "できます");
  } else if (dict.endsWith("くる") || dict.endsWith("来る")) {
    const kanji = dict.endsWith("来る");
    const stem = dict.slice(0, -2);
    // 来る는 어간 모음이 바뀌지만 한자 표기(来)는 그대로다
    const i = kanji ? stem + "来" : stem + "き";
    const a = kanji ? stem + "来" : stem + "こ";
    pushAll(out, i, [...POLITE, "た", "て", "ています", "ている"]);
    pushAll(out, a, ["ない", "なかった", "よう"]);
  }
  return [...out];
}

/** い형용사 */
function iAdjForms(dict: string): string[] {
  if (!dict.endsWith("い")) return [dict];
  const stem = dict.slice(0, -1);
  return [
    dict,
    dict + "です",
    ...["かった", "かったです", "くない", "くなかった", "くて", "く", "ければ", "さ"].map((t) => stem + t),
  ];
}

/** な형용사 */
function naAdjForms(dict: string): string[] {
  return [dict, ...["な", "に", "で", "だ", "です", "だった", "でした", "じゃない"].map((t) => dict + t)];
}

// ── 학습용 활용표 ──
// 문장 매칭용 목록과 달리, 여기서는 '외울 가치가 있는 대표형'만 이름표를 달아 낸다.

export interface Conjugation {
  label: string;
  form: string;
  hint: string;
}

/**
 * 문제에 쓸 이름. 표에서는 '조건'으로 짧게 두지만 문제로 나가면
 * "조건을 고르세요"가 되어 뭘 하라는 건지 모호해진다 — '조건형'으로 읽히게 한다.
 */
export const formName = (label: string) => (label.endsWith("형") ? label : label + "형");

function godanTable(dict: string): Conjugation[] {
  const row = GODAN[dict.slice(-1)];
  if (!row) return [];
  const s = dict.slice(0, -1);
  return [
    { label: "정중형", form: s + row.i + "ます", hint: "~합니다" },
    { label: "정중 과거", form: s + row.i + "ました", hint: "~했습니다" },
    { label: "정중 부정", form: s + row.i + "ません", hint: "~하지 않습니다" },
    { label: "て형", form: s + row.te, hint: "~하고, ~해서 (문장 연결)" },
    { label: "진행", form: s + row.te + "います", hint: "~하고 있습니다" },
    { label: "과거", form: s + row.ta, hint: "~했다 (반말)" },
    { label: "부정", form: s + row.a + "ない", hint: "~하지 않는다" },
    { label: "가능", form: s + row.e + "る", hint: "~할 수 있다" },
    { label: "의지", form: s + row.o + "う", hint: "~하자, ~해야지" },
    { label: "조건", form: s + row.e + "ば", hint: "~하면" },
  ];
}

function ichidanTable(dict: string): Conjugation[] {
  if (!dict.endsWith("る")) return [];
  const s = dict.slice(0, -1);
  return [
    { label: "정중형", form: s + "ます", hint: "~합니다" },
    { label: "정중 과거", form: s + "ました", hint: "~했습니다" },
    { label: "정중 부정", form: s + "ません", hint: "~하지 않습니다" },
    { label: "て형", form: s + "て", hint: "~하고, ~해서 (문장 연결)" },
    { label: "진행", form: s + "ています", hint: "~하고 있습니다" },
    { label: "과거", form: s + "た", hint: "~했다 (반말)" },
    { label: "부정", form: s + "ない", hint: "~하지 않는다" },
    { label: "가능·수동", form: s + "られる", hint: "~할 수 있다 / ~당하다" },
    { label: "의지", form: s + "よう", hint: "~하자, ~해야지" },
    { label: "조건", form: s + "れば", hint: "~하면" },
  ];
}

function irregularTable(dict: string): Conjugation[] {
  if (dict.endsWith("する")) {
    const s = dict.slice(0, -2);
    return [
      { label: "정중형", form: s + "します", hint: "~합니다" },
      { label: "정중 과거", form: s + "しました", hint: "~했습니다" },
      { label: "정중 부정", form: s + "しません", hint: "~하지 않습니다" },
      { label: "て형", form: s + "して", hint: "~하고, ~해서" },
      { label: "진행", form: s + "しています", hint: "~하고 있습니다" },
      { label: "과거", form: s + "した", hint: "~했다 (반말)" },
      { label: "부정", form: s + "しない", hint: "~하지 않는다" },
      { label: "가능", form: s + "できる", hint: "~할 수 있다" },
      { label: "의지", form: s + "しよう", hint: "~하자" },
      { label: "조건", form: s + "すれば", hint: "~하면" },
    ];
  }
  if (dict.endsWith("来る") || dict.endsWith("くる")) {
    const kanji = dict.endsWith("来る");
    const s = dict.slice(0, -2);
    const i = kanji ? s + "来" : s + "き";
    const a = kanji ? s + "来" : s + "こ";
    return [
      { label: "정중형", form: i + "ます", hint: "옵니다" },
      { label: "정중 과거", form: i + "ました", hint: "왔습니다" },
      { label: "て형", form: i + "て", hint: "오고, 와서" },
      { label: "과거", form: i + "た", hint: "왔다 (반말)" },
      { label: "부정", form: a + "ない", hint: "오지 않는다" },
      { label: "의지", form: a + "よう", hint: "오자" },
    ];
  }
  return [];
}

function iAdjTable(dict: string): Conjugation[] {
  if (!dict.endsWith("い")) return [];
  const s = dict.slice(0, -1);
  return [
    { label: "정중형", form: dict + "です", hint: "~합니다" },
    { label: "과거", form: s + "かった", hint: "~했다" },
    { label: "정중 과거", form: s + "かったです", hint: "~했습니다" },
    { label: "부정", form: s + "くない", hint: "~하지 않다" },
    { label: "연결", form: s + "くて", hint: "~하고, ~해서" },
    { label: "부사형", form: s + "く", hint: "~하게 (동사 꾸밈)" },
    { label: "조건", form: s + "ければ", hint: "~하면" },
  ];
}

function naAdjTable(dict: string): Conjugation[] {
  return [
    { label: "정중형", form: dict + "です", hint: "~합니다" },
    { label: "명사 수식", form: dict + "な", hint: "~한 (뒤에 명사)" },
    { label: "부사형", form: dict + "に", hint: "~하게" },
    { label: "과거", form: dict + "だった", hint: "~했다" },
    { label: "정중 과거", form: dict + "でした", hint: "~했습니다" },
    { label: "부정", form: dict + "じゃない", hint: "~하지 않다" },
    { label: "연결", form: dict + "で", hint: "~하고" },
  ];
}

/** 이 단어의 대표 활용형 표. 활용하지 않는 품사면 빈 배열. */
export function conjugationTable(word: Word, dict: string): Conjugation[] {
  switch (word.type.kind) {
    case "verb":
      return word.type.group === 1
        ? godanTable(dict)
        : word.type.group === 2
          ? ichidanTable(dict)
          : irregularTable(dict);
    case "i-adj":
      return iAdjTable(dict);
    case "na-adj":
      return naAdjTable(dict);
    default:
      return [];
  }
}

/** 이 단어가 문장에 나타날 수 있는 표기들 (사전형 포함) */
export function surfaceForms(word: Word, dict: string): string[] {
  switch (word.type.kind) {
    case "verb":
      return word.type.group === 1
        ? godanForms(dict)
        : word.type.group === 2
          ? ichidanForms(dict)
          : irregularForms(dict);
    case "i-adj":
      return iAdjForms(dict);
    case "na-adj":
      return naAdjForms(dict);
    default:
      return [dict];
  }
}
