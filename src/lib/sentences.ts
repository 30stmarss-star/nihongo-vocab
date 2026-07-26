import { supabase, CLOUD } from "./supabase";
import type { Token } from "../components/JpText";

/**
 * 문장 형태소 분해 결과의 저장소.
 *
 * 규칙 기반 매칭은 문맥을 안 보기 때문에 활용형·조사에서 한계가 있다.
 * 문맥까지 보는 분해는 LLM이 하고, 문장 단위로 캐시해 두 번은 공짜로 쓴다.
 * 오늘 예문은 코스가 시작될 때 미리 분석해 두어 카드를 열자마자 정확히 보이게 한다.
 */

const key = (jp: string) => `sentence.tokens.${jp}`;

export function loadTokens(jp: string): Token[] | null {
  try {
    const raw = localStorage.getItem(key(jp));
    return raw ? (JSON.parse(raw) as Token[]) : null;
  } catch {
    return null;
  }
}

export function saveTokens(jp: string, tokens: Token[]): void {
  try {
    localStorage.setItem(key(jp), JSON.stringify(tokens));
  } catch {
    /* 저장 공간이 없으면 이번만 쓰고 넘어간다 */
  }
}

/** 분해 결과가 원문과 어긋나면(글자 누락·추가) 쓰지 않는다 */
export function tokensMatch(tokens: Token[], jp: string): boolean {
  return tokens.map((t) => t.surface ?? "").join("") === jp;
}

/** 문장 하나 분해 (버튼으로 즉시 요청할 때) */
export async function analyzeSentence(jp: string, ko?: string): Promise<Token[]> {
  if (!supabase) throw new Error("클라우드 모드에서만 쓸 수 있어요.");
  const { data, error } = await supabase.functions.invoke("analyze-sentence", {
    body: { sentence: jp, ko },
  });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
  const tokens: Token[] = Array.isArray(data?.tokens) ? data.tokens : [];
  if (!tokens.length) throw new Error("분해 결과가 비어 있어요.");
  if (!tokensMatch(tokens, jp)) throw new Error("분해 결과가 원문과 달라요.");
  saveTokens(jp, tokens);
  return tokens;
}

/**
 * 여러 문장을 미리 분해해 캐시에 채운다 (코스 시작 시 백그라운드).
 * 이미 캐시에 있는 문장은 건너뛰므로, 복습 단어가 많은 날은 호출이 거의 없다.
 */
export async function prefetchSentences(sentences: string[]): Promise<number> {
  if (!(CLOUD && supabase)) return 0;
  const todo = [...new Set(sentences.filter((s) => s && !loadTokens(s)))];
  if (!todo.length) return 0;

  let saved = 0;
  // 한 번에 너무 많이 보내면 응답이 잘린다 — 20문장씩 끊어서
  for (let i = 0; i < todo.length; i += 20) {
    const batch = todo.slice(i, i + 20);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-sentence", {
        body: { sentences: batch },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      const results: Array<{ sentence: string; tokens: Token[] }> = Array.isArray(data?.results)
        ? data.results
        : [];
      for (const r of results) {
        if (!r?.sentence || !Array.isArray(r.tokens)) continue;
        // 원문과 정확히 맞는 것만 채택 (엉뚱한 문장에 붙지 않게)
        const jp = batch.find((s) => s === r.sentence);
        if (jp && tokensMatch(r.tokens, jp)) {
          saveTokens(jp, r.tokens);
          saved++;
        }
      }
    } catch (e) {
      console.warn("[sentence] 미리 분해 실패(필요할 때 다시 시도):", e instanceof Error ? e.message : e);
      break;
    }
  }
  return saved;
}
