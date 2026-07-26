import type { Word } from "../data/types";
import { boundPrefix } from "../data/types";
import { conjugationTable } from "./conjugate";

/**
 * 문제 생성기 — JLPT 문자·어휘 파트가 실제로 내는 유형을 데이터만으로 만든다.
 * (문장형 문제는 LLM이 만든다 — generate-exam Edge Function)
 *
 * 핵심은 '오답 보기'다. 아무 단어나 섞으면 뜻만 보고 소거되니,
 * 읽기 문제는 장단음·탁음·촉음만 비튼 가짜 독음을, 표기 문제는 비슷한 한자를 쓴다.
 */

export type Question =
  /** 한자 읽기: 辞書 → じしょ */
  | { kind: "reading"; word: Word; choices: string[]; answer: number }
  /** 표기: じしょ → 辞書 */
  | { kind: "writing"; word: Word; choices: string[]; answer: number }
  /** 뜻 고르기: 辞書 → 사전 */
  | { kind: "meaning"; word: Word; choices: string[]; answer: number }
  /** 활용형: 調べる의 정중형 → 調べます */
  | { kind: "conjugate"; word: Word; label: string; hint: string; choices: string[]; answer: number }
  /** 뜻 → 독음 타이핑 */
  | { kind: "type"; word: Word }
  /** 문맥 규정: 빈칸에 알맞은 단어 */
  | { kind: "cloze"; word: Word; sentence: string; ko: string; choices: string[]; answer: number }
  /** 유의 표현: 밑줄 친 말과 가장 가까운 것 */
  | { kind: "synonym"; word: Word; sentence: string; ko: string; choices: string[]; answer: number }
  /** 용법: 이 단어가 올바르게 쓰인 문장 */
  | { kind: "usage"; word: Word; choices: string[]; answer: number };

export function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

/** 정답을 섞어 넣고 그 위치를 알려준다 */
function withAnswer(correct: string, wrong: string[]): { choices: string[]; answer: number } {
  const all = shuffle([correct, ...wrong.slice(0, 3)]);
  return { choices: all, answer: all.indexOf(correct) };
}

// ── 가짜 독음 만들기 ──

const DAKUTEN: Record<string, string> = {
  か: "が", き: "ぎ", く: "ぐ", け: "げ", こ: "ご",
  さ: "ざ", し: "じ", す: "ず", せ: "ぜ", そ: "ぞ",
  た: "だ", ち: "ぢ", つ: "づ", て: "で", と: "ど",
  は: "ば", ひ: "び", ふ: "ぶ", へ: "べ", ほ: "ぼ",
};
const UNDAKUTEN: Record<string, string> = Object.fromEntries(
  Object.entries(DAKUTEN).map(([k, v]) => [v, k])
);
/** 장음이 붙을 수 있는 お·え단 (뒤에 う/い가 오는 흔한 실수) */
const LONG_O = "おこそとのほもよろごぞどぼぽょ";
const LONG_E = "えけせてねへめれげぜでべぺ";

/** 실제 독음을 살짝 비틀어 '있을 법한 오답' 3개를 만든다 */
export function fakeReadings(kana: string): string[] {
  const out = new Set<string>();
  const chars = [...kana];

  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const next = chars[i + 1];

    // 장음 추가: しょ → しょう, こ → こう
    if (LONG_O.includes(c) && next !== "う") {
      out.add(chars.slice(0, i + 1).join("") + "う" + chars.slice(i + 1).join(""));
    }
    if (LONG_E.includes(c) && next !== "い") {
      out.add(chars.slice(0, i + 1).join("") + "い" + chars.slice(i + 1).join(""));
    }
    // 장음 제거: こう → こ
    if (c === "う" && i > 0 && LONG_O.includes(chars[i - 1])) {
      out.add(chars.filter((_, j) => j !== i).join(""));
    }
    // 탁음 토글: じ ↔ し
    if (DAKUTEN[c]) out.add(chars.map((x, j) => (j === i ? DAKUTEN[c] : x)).join(""));
    if (UNDAKUTEN[c]) out.add(chars.map((x, j) => (j === i ? UNDAKUTEN[c] : x)).join(""));
    // 촉음 추가/제거
    if (c === "っ") out.add(chars.filter((_, j) => j !== i).join(""));
    else if (i > 0 && "かきくけこさしすせそたちつてとぱぴぷぺぽ".includes(c)) {
      out.add(chars.slice(0, i).join("") + "っ" + chars.slice(i).join(""));
    }
    // 요음 크기: ょ → よ
    if ("ゃゅょ".includes(c)) {
      const big = { ゃ: "や", ゅ: "ゆ", ょ: "よ" }[c as "ゃ" | "ゅ" | "ょ"];
      out.add(chars.map((x, j) => (j === i ? big : x)).join(""));
    }
  }

  out.delete(kana);
  return shuffle([...out]);
}

// ── 유형별 생성 ──

/** 한자 읽기 — 한자 단어일 때만 (가나 단어는 물어볼 게 없다) */
export function readingQ(w: Word, pool: Word[]): Question | null {
  if (w.kanji === w.kana) return null;
  const fakes = fakeReadings(w.kana);
  // 비틀기로 3개를 못 채우면 같은 급수 다른 단어의 독음으로 보충
  const filler = pool
    .filter((x) => x.id !== w.id && x.kana !== w.kana && x.kana.length === w.kana.length)
    .map((x) => x.kana);
  const wrong = [...new Set([...fakes, ...shuffle(filler)])].slice(0, 3);
  if (wrong.length < 3) return null;
  return { kind: "reading", word: w, ...withAnswer(w.kana, wrong) };
}

/** 표기 문제용: 표제어 뒤에 붙은 오쿠리가나 꼬리 (暖かい → "かい") */
const okurigana = (s: string) => s.match(/[ぁ-んー]+$/)?.[0] ?? "";

/**
 * 표기 — 오쿠리가나 꼬리가 같은 단어를 최우선 오답으로 쓴다.
 * 「あたたかい」에 賑やか가 섞이면 꼴만 보고 지워지지만,
 * 暖かい·親しい처럼 꼬리가 같으면 한자를 실제로 알아야 고를 수 있다.
 */
export function writingQ(w: Word, pool: Word[]): Question | null {
  if (w.kanji === w.kana || !/[一-龯]/.test(w.kanji)) return null;
  const chars = new Set([...w.kanji]);
  const tail = okurigana(w.kanji);
  const usable = pool.filter((x) => x.id !== w.id && x.kanji !== w.kanji && /[一-龯]/.test(x.kanji));
  const sameTail = tail ? usable.filter((x) => okurigana(x.kanji) === tail) : [];
  const ranked = [
    // 꼬리가 같고 글자 수도 같은 것 → 꼬리만 같은 것
    ...shuffle(sameTail.filter((x) => x.kanji.length === w.kanji.length)),
    ...shuffle(sameTail),
    // 꼬리가 없는 단어(순한자어)면 겹치는 한자를 쓰는 쪽이 헷갈린다
    ...shuffle(
      usable.filter(
        (x) =>
          okurigana(x.kanji) === tail &&
          x.kanji.length === w.kanji.length &&
          [...x.kanji].some((c) => chars.has(c))
      )
    ),
    ...shuffle(usable.filter((x) => okurigana(x.kanji) === tail && x.kanji.length === w.kanji.length)),
    ...shuffle(usable.filter((x) => x.kanji.length === w.kanji.length)),
    ...shuffle(usable),
  ];
  const wrong: string[] = [];
  const seen = new Set([w.kanji]);
  for (const x of ranked) {
    if (seen.has(x.kanji)) continue;
    seen.add(x.kanji);
    wrong.push(x.kanji);
    if (wrong.length === 3) break;
  }
  if (wrong.length < 3) return null;
  return { kind: "writing", word: w, ...withAnswer(w.kanji, wrong) };
}

/** 뜻 고르기 — 같은 품사·같은 급수를 우선해 뜻만 보고 소거하지 못하게 */
export function meaningQ(w: Word, pool: Word[]): Question | null {
  const usable = pool.filter((x) => x.id !== w.id && x.meaning !== w.meaning);
  const samePos = usable.filter((x) => x.type.kind === w.type.kind);
  const ranked = [
    ...shuffle(samePos.filter((x) => x.level === w.level)),
    ...shuffle(samePos),
    ...shuffle(usable.filter((x) => x.level === w.level)),
    ...shuffle(usable),
  ];
  const wrong: string[] = [];
  const seen = new Set([w.meaning]);
  for (const x of ranked) {
    if (seen.has(x.meaning)) continue;
    seen.add(x.meaning);
    wrong.push(x.meaning);
    if (wrong.length === 3) break;
  }
  if (wrong.length < 3) return null;
  return { kind: "meaning", word: w, ...withAnswer(w.meaning, wrong) };
}

/**
 * 활용형 — 오답은 '다른 활용 규칙을 잘못 적용한 형태'로 만든다.
 * 調べる(2군)의 정중형에 1군 규칙을 쓰면 調べります. 딱 학습자가 하는 실수다.
 */
export function conjugateQ(w: Word): Question | null {
  const table = conjugationTable(w, w.kanji);
  if (!table.length) return null;
  const pick = table[Math.floor(Math.random() * table.length)];

  const wrong = new Set<string>();
  // 다른 활용형들 (형태는 그럴듯하지만 물어본 것과 다름)
  for (const r of shuffle(table)) if (r.form !== pick.form) wrong.add(r.form);
  // 활용 규칙 오적용: 동사 군을 바꿔서 만든 형태
  if (w.type.kind === "verb") {
    const other = w.type.group === 2 ? { kind: "verb" as const, group: 1 as const } : { kind: "verb" as const, group: 2 as const };
    for (const r of conjugationTable({ ...w, type: other }, w.kanji)) {
      if (r.label === pick.label && r.form !== pick.form) wrong.add(r.form);
    }
  }
  wrong.delete(pick.form);
  const list = [...wrong];
  if (list.length < 3) return null;
  // 규칙 오적용 오답이 있으면 그걸 먼저 쓴다
  return {
    kind: "conjugate",
    word: w,
    label: pick.label,
    hint: pick.hint,
    ...withAnswer(pick.form, list.slice(0, 3)),
  };
}

/** 뜻 → 독음 타이핑 */
export function typeQ(w: Word): Question {
  return { kind: "type", word: w };
}

/** 문제에 표시할 표제어 (후행 결합형이면 ~ 붙임) */
export const headword = (w: Word) => boundPrefix(w) + w.kanji;
