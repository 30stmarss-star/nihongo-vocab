export type Level = "N5" | "N4" | "N3" | "N2";

/** 사용자가 고르는 난이도 묶음 */
export type Band = "N5N4" | "N3" | "N2";

export const BANDS: { id: Band; label: string; levels: Level[] }[] = [
  { id: "N5N4", label: "N5 · N4 (입문)", levels: ["N5", "N4"] },
  { id: "N3", label: "N3 (중급)", levels: ["N3"] },
  { id: "N2", label: "N2 (중상급)", levels: ["N2"] },
];

/** 품사 / 활용 종류 */
export type WordType =
  | { kind: "verb"; group: 1 | 2 | 3 } // 1군(5단) / 2군(1단) / 3군(불규칙)
  | { kind: "i-adj" } // い형용사
  | { kind: "na-adj" } // な형용사
  | { kind: "noun" } // 명사
  | { kind: "adverb" } // 부사
  | { kind: "expression" }; // 표현/관용구

/** 한국식 한자 훈독: { char: "食", reading: "먹을 식" } */
export interface Hanja {
  char: string;
  reading: string;
}

export interface Example {
  jp: string; // 예문 (한자 포함)
  kana: string; // 히라가나 독음
  ko: string; // 한국어 뜻
}

export interface Word {
  id: string;
  kanji: string; // 표제어 (한자 없으면 kana와 동일)
  kana: string; // 히라가나 독음
  meaning: string; // 한국어 뜻
  level: Level;
  type: WordType;
  hanja: Hanja[]; // 구성 한자의 한국식 훈독 (가나 단어면 빈 배열)
  examples: Example[];
  freq?: number; // 중요도/빈도 등급 1=핵심(가장 먼저) 2=보통 3=덜 중요 (없으면 2로 취급)
}

/** 표 "활용/품사" 열에 표시할 짧은 라벨 */
export function typeLabel(t: WordType): string {
  switch (t.kind) {
    case "verb":
      return `${t.group}군`;
    case "i-adj":
      return "い형용사";
    case "na-adj":
      return "な형용사";
    case "noun":
      return "명사";
    case "adverb":
      return "부사";
    case "expression":
      return "표현";
  }
}
