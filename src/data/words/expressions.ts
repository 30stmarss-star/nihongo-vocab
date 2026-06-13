import type { Word } from "../types";

/** 레벨별 자주 쓰는 표현 · 관용구 */
export const EXPRESSION_WORDS: Word[] = [
  {
    id: "exp-otsukare",
    kanji: "お疲れさま",
    kana: "おつかれさま",
    meaning: "수고하셨습니다",
    level: "N5",
    type: { kind: "expression" },
    hanja: [{ char: "疲", reading: "피곤할 피" }],
    examples: [
      { jp: "今日もお疲れさま。", kana: "きょうもおつかれさま。", ko: "오늘도 수고했어." },
    ],
  },
  {
    id: "exp-osewani",
    kanji: "お世話になります",
    kana: "おせわになります",
    meaning: "신세를 지겠습니다 (잘 부탁드립니다)",
    level: "N4",
    type: { kind: "expression" },
    hanja: [
      { char: "世", reading: "세상 세" },
      { char: "話", reading: "말씀 화" },
    ],
    examples: [
      { jp: "いつもお世話になります。", kana: "いつもおせわになります。", ko: "늘 신세를 지고 있습니다." },
    ],
  },
  {
    id: "exp-kamoshirenai",
    kanji: "かもしれない",
    kana: "かもしれない",
    meaning: "~일지도 모른다",
    level: "N4",
    type: { kind: "expression" },
    hanja: [],
    examples: [
      { jp: "雨が降るかもしれない。", kana: "あめがふるかもしれない。", ko: "비가 올지도 모른다." },
    ],
  },
  {
    id: "exp-tahougaii",
    kanji: "た方がいい",
    kana: "たほうがいい",
    meaning: "~하는 편이 좋다",
    level: "N4",
    type: { kind: "expression" },
    hanja: [{ char: "方", reading: "모 방" }],
    examples: [
      { jp: "早く寝た方がいい。", kana: "はやくねたほうがいい。", ko: "일찍 자는 편이 좋다." },
    ],
  },
  {
    id: "exp-shoujiki",
    kanji: "正直に言うと",
    kana: "しょうじきにいうと",
    meaning: "솔직히 말하면",
    level: "N3",
    type: { kind: "expression" },
    hanja: [
      { char: "正", reading: "바를 정" },
      { char: "直", reading: "곧을 직" },
      { char: "言", reading: "말씀 언" },
    ],
    examples: [
      { jp: "正直に言うと、疲れた。", kana: "しょうじきにいうと、つかれた。", ko: "솔직히 말하면 피곤하다." },
    ],
  },
  {
    id: "exp-tonikaku",
    kanji: "とにかく",
    kana: "とにかく",
    meaning: "어쨌든 · 아무튼",
    level: "N3",
    type: { kind: "expression" },
    hanja: [],
    examples: [
      { jp: "とにかくやってみよう。", kana: "とにかくやってみよう。", ko: "어쨌든 해 보자." },
    ],
  },
  {
    id: "exp-dekirudake",
    kanji: "できるだけ",
    kana: "できるだけ",
    meaning: "가능한 한",
    level: "N3",
    type: { kind: "expression" },
    hanja: [],
    examples: [
      { jp: "できるだけ早く来てください。", kana: "できるだけはやくきてください。", ko: "가능한 한 빨리 와 주세요." },
    ],
  },
  {
    id: "exp-nikanshite",
    kanji: "に関して",
    kana: "にかんして",
    meaning: "~에 관해서",
    level: "N2",
    type: { kind: "expression" },
    hanja: [{ char: "関", reading: "관계할 관" }],
    examples: [
      { jp: "この件に関して話す。", kana: "このけんにかんしてはなす。", ko: "이 건에 관해서 이야기한다." },
    ],
  },
  {
    id: "exp-niwatande",
    kanji: "に違いない",
    kana: "にちがいない",
    meaning: "~임에 틀림없다",
    level: "N2",
    type: { kind: "expression" },
    hanja: [{ char: "違", reading: "어긋날 위" }],
    examples: [
      { jp: "彼が犯人に違いない。", kana: "かれがはんにんにちがいない。", ko: "그가 범인임에 틀림없다." },
    ],
  },
];
