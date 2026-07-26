import { useMemo } from "react";
import type { Word, WordType } from "../data/types";
import { isBoundForm } from "../data/types";
import { surfaceForms } from "../lib/conjugate";

/**
 * 일본어 문장에서 단어를 탭 가능한 조각으로 렌더한다. 탭하면 단어 카드가 뜬다.
 *
 * 두 경로가 있다:
 *  1) 규칙 기반(기본) — 사전 단어의 활용형까지 펼쳐 최장 일치로 찾는다. 즉시·무료.
 *  2) LLM 분해(tokens) — 문장을 통째로 분석한 결과를 받으면 그걸 그대로 쓴다.
 *     규칙이 못 잡는 형태(사역수동·구어 축약 등)까지 잡힌다.
 *
 * 규칙 경로의 오탐 방지 (일본어는 띄어쓰기가 없어 부분일치가 잘 난다):
 *  - 한자 표기는 그대로 매칭 (한자가 경계 역할을 한다)
 *  - 독음(가나)은 '원래 가나로 쓰는 단어'일 때만. 今(いま)의 독음으로
 *    「習っています」의 …いま…를 잡던 오탐을 막는다.
 *  - 가나 단어는 앞 글자가 가나면 매칭하지 않는다(단어 중간을 자르지 않게).
 *  - 후행 결합형(~って 등)은 문법 패턴이라 문장 안에서 매칭하지 않는다.
 */

const KANA = /[ぁ-んァ-ヴー]/;
const hasKanji = (s: string) => /[一-龯]/.test(s);

/** LLM이 분해한 토큰 */
export interface Token {
  surface: string;
  base: string;
  kana: string;
  meaning: string;
  pos: string;
  level: string;
  note: string;
}

const POS_TO_TYPE: Record<string, WordType> = {
  동사: { kind: "verb", group: 1 },
  い형용사: { kind: "i-adj" },
  な형용사: { kind: "na-adj" },
  명사: { kind: "noun" },
  부사: { kind: "adverb" },
  조사: { kind: "expression" },
  표현: { kind: "expression" },
};

/** 토큰을 카드에 띄울 수 있는 Word 모양으로. 사전에 있으면 진짜 단어를 쓴다. */
export function tokenToWord(t: Token, dictionary: Word[]): Word {
  const real = dictionary.find((w) => w.kanji === t.base && (!t.kana || w.kana === t.kana));
  if (real) return real;
  return {
    id: `token:${t.base}:${t.kana}`, // 사전에 없는 임시 단어 (단어장 추가는 막힌다)
    kanji: t.base,
    kana: t.kana || t.base,
    meaning: t.meaning + (t.note ? ` — ${t.note}` : ""),
    level: (["N5", "N4", "N3", "N2", "N1"].includes(t.level) ? t.level : "N5") as Word["level"],
    type: POS_TO_TYPE[t.pos] ?? { kind: "expression" },
    hanja: [],
    examples: [],
  };
}

/** 사전에 없는 임시 토큰인지 (단어장 추가 버튼을 숨기는 데 쓴다) */
export const isTokenWord = (w: Word) => w.id.startsWith("token:");

// 사전 인덱스는 무겁다 — 같은 사전 배열이면 재사용한다(예문마다 다시 짓지 않게).
type Index = Map<string, Array<{ w: Word; key: string }>>;
const indexCache = new WeakMap<Word[], Index>();

function buildIndex(dictionary: Word[]): Index {
  const cached = indexCache.get(dictionary);
  if (cached) return cached;

  const m: Index = new Map();
  for (const w of dictionary) {
    if (isBoundForm(w)) continue; // ~로 시작하는 문법 패턴은 제외
    const keys = new Set<string>();
    // 한자 표기 + 그 활용형
    if (hasKanji(w.kanji)) for (const f of surfaceForms(w, w.kanji)) keys.add(f);
    // 가나 표기는 '원래 가나로 쓰는 단어'일 때만 (한자어의 독음은 제외)
    if (w.kanji === w.kana) for (const f of surfaceForms(w, w.kana)) keys.add(f);
    for (const key of keys) {
      if (!key) continue;
      // 한 글자짜리는 한자일 때만 허용(가나 한 글자는 오탐 천지).
      // 한자 한 글자도 熟語를 쪼개지 않도록 매칭 시점에 이웃을 확인한다.
      if (key.length < 2 && !hasKanji(key)) continue;
      const arr = m.get(key[0]) ?? [];
      arr.push({ w, key });
      m.set(key[0], arr);
    }
  }
  for (const arr of m.values()) arr.sort((a, b) => b.key.length - a.key.length);
  indexCache.set(dictionary, m);
  return m;
}

export function JpText({
  text,
  dictionary,
  tokens,
  onShowCard,
}: {
  text: string;
  dictionary: Word[];
  tokens?: Token[] | null;
  onShowCard: (word: Word, x: number, y: number) => void;
}) {
  const parts = useMemo(() => {
    const out: Array<{ text: string; word?: Word }> = [];

    // 1) LLM 분해 결과가 있으면 그대로 쓴다 (조사·부호는 링크로 만들지 않음)
    if (tokens && tokens.length) {
      for (const t of tokens) {
        if (!t?.surface) continue;
        const plain = t.pos === "조사" || t.pos === "부호" || !t.meaning;
        out.push(plain ? { text: t.surface } : { text: t.surface, word: tokenToWord(t, dictionary) });
      }
      return out;
    }

    // 2) 규칙 기반 최장 일치
    const index = buildIndex(dictionary);
    let buf = "";
    let i = 0;
    while (i < text.length) {
      const candidates = index.get(text[i]) ?? [];
      let hit: { w: Word; len: number } | null = null;
      for (const { w, key } of candidates) {
        if (!text.startsWith(key, i)) continue;
        // 가나로 시작하는 표기는 앞 글자가 가나면 단어 중간일 가능성이 커서 건너뛴다
        if (!hasKanji(key[0]) && i > 0 && KANA.test(text[i - 1])) continue;
        // 한자 한 글자는 熟語(日本語)의 일부를 떼어내지 않도록 이웃이 한자면 건너뛴다
        if (key.length === 1) {
          const prev = i > 0 ? text[i - 1] : "";
          const next = text[i + 1] ?? "";
          if (hasKanji(prev) || hasKanji(next)) continue;
        }
        if (!hit || key.length > hit.len) hit = { w, len: key.length };
      }
      if (hit) {
        if (buf) {
          out.push({ text: buf });
          buf = "";
        }
        out.push({ text: text.slice(i, i + hit.len), word: hit.w });
        i += hit.len;
      } else {
        buf += text[i];
        i++;
      }
    }
    if (buf) out.push({ text: buf });
    return out;
  }, [text, dictionary, tokens]);

  return (
    <>
      {parts.map((p, i) =>
        p.word ? (
          <button
            key={i}
            type="button"
            onClick={(e) => {
              e.stopPropagation(); // 카드 뒤집기 등 부모 탭 동작과 분리
              onShowCard(p.word!, e.clientX, e.clientY);
            }}
            className="rounded-md bg-pri-soft px-0.5 font-bold text-pri-deep underline decoration-pri/40 decoration-2 underline-offset-2"
          >
            {p.text}
          </button>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  );
}
