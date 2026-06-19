import raw from "./confusables.json";

/** 닮은꼴 한자 한 글자(그룹 안의 한 항목) */
export interface ConfusableKanji {
  kanji: string;
  /** 비슷한 글자와 구별하는 핵심 포인트(항상 보여줌) */
  distinguish_ko: string;
  meaning_ko: string;
  /** 음/훈 읽기 키 (예: "やす(む)·キュウ") */
  reading_key: string;
  example: {
    word: string;
    reading: string;
    meaning_ko: string;
  };
}

/** 서로 헷갈리기 쉬운 한자들을 묶은 그룹 */
export interface ConfusableGroup {
  group_id: string;
  group_label: string;
  kanji: ConfusableKanji[];
}

export const CONFUSABLE_GROUPS: ConfusableGroup[] = (raw as { groups: ConfusableGroup[] }).groups;
