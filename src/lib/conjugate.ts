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
