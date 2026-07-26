import { useMemo } from "react";
import type { Word } from "../data/types";

/**
 * 일본어 문장에서 사전에 있는 단어를 탭 가능한 조각으로 렌더 (최장 일치).
 * 예문·모범답안 등 어디서든 재사용한다. 탭하면 단어 카드가 뜬다.
 */
export function JpText({
  text,
  dictionary,
  onShowCard,
}: {
  text: string;
  dictionary: Word[];
  onShowCard: (word: Word, x: number, y: number) => void;
}) {
  const index = useMemo(() => {
    const m = new Map<string, Word[]>();
    for (const w of dictionary) {
      for (const key of new Set([w.kanji, w.kana])) {
        if (!key || key.length < 2) continue; // 한 글자는 오탐이 많아 제외
        const head = key[0];
        const arr = m.get(head) ?? [];
        arr.push(w);
        m.set(head, arr);
      }
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => Math.max(b.kanji.length, b.kana.length) - Math.max(a.kanji.length, a.kana.length));
    }
    return m;
  }, [dictionary]);

  const parts = useMemo(() => {
    const out: Array<{ text: string; word?: Word }> = [];
    let buf = "";
    let i = 0;
    while (i < text.length) {
      const candidates = index.get(text[i]) ?? [];
      let hit: { w: Word; len: number } | null = null;
      for (const w of candidates) {
        for (const key of [w.kanji, w.kana]) {
          if (key.length >= 2 && text.startsWith(key, i)) {
            if (!hit || key.length > hit.len) hit = { w, len: key.length };
          }
        }
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
  }, [text, index]);

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
