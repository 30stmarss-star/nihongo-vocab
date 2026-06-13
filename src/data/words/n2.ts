import type { Word } from "../types";

/** N2 핵심 단어 */
export const N2_WORDS: Word[] = [
  // ── 동사 ──
  {
    id: "kuwawaru",
    kanji: "加わる",
    kana: "くわわる",
    meaning: "더해지다 · 참가하다",
    level: "N2",
    type: { kind: "verb", group: 1 },
    hanja: [{ char: "加", reading: "더할 가" }],
    examples: [
      { jp: "新しい仲間が加わる。", kana: "あたらしいなかまがくわわる。", ko: "새로운 동료가 합류한다." },
      { jp: "計画に加わりました。", kana: "けいかくにくわわりました。", ko: "계획에 참가했습니다." },
    ],
  },
  {
    id: "noberu",
    kanji: "述べる",
    kana: "のべる",
    meaning: "서술하다 · 진술하다",
    level: "N2",
    type: { kind: "verb", group: 2 },
    hanja: [{ char: "述", reading: "펼 술" }],
    examples: [
      { jp: "意見を述べる。", kana: "いけんをのべる。", ko: "의견을 진술한다." },
      { jp: "理由を述べました。", kana: "りゆうをのべました。", ko: "이유를 서술했습니다." },
    ],
  },
  {
    id: "fusegu",
    kanji: "防ぐ",
    kana: "ふせぐ",
    meaning: "막다 · 방지하다",
    level: "N2",
    type: { kind: "verb", group: 1 },
    hanja: [{ char: "防", reading: "막을 방" }],
    examples: [
      { jp: "事故を防ぐ。", kana: "じこをふせぐ。", ko: "사고를 방지한다." },
      { jp: "風邪を防ぎます。", kana: "かぜをふせぎます。", ko: "감기를 막습니다." },
    ],
  },
  {
    id: "kotonaru",
    kanji: "異なる",
    kana: "ことなる",
    meaning: "다르다 · 상이하다",
    level: "N2",
    type: { kind: "verb", group: 1 },
    hanja: [{ char: "異", reading: "다를 이" }],
    examples: [
      { jp: "意見が異なる。", kana: "いけんがことなる。", ko: "의견이 다르다." },
      { jp: "文化が異なります。", kana: "ぶんかがことなります。", ko: "문화가 다릅니다." },
    ],
  },
  {
    id: "motomeru",
    kanji: "求める",
    kana: "もとめる",
    meaning: "구하다 · 요구하다",
    level: "N2",
    type: { kind: "verb", group: 2 },
    hanja: [{ char: "求", reading: "구할 구" }],
    examples: [
      { jp: "助けを求める。", kana: "たすけをもとめる。", ko: "도움을 구한다." },
      { jp: "意見を求めました。", kana: "いけんをもとめました。", ko: "의견을 요구했습니다." },
    ],
  },
  {
    id: "kakaeru",
    kanji: "抱える",
    kana: "かかえる",
    meaning: "(문제·짐을) 안다 · 떠안다",
    level: "N2",
    type: { kind: "verb", group: 2 },
    hanja: [{ char: "抱", reading: "안을 포" }],
    examples: [
      { jp: "問題を抱える。", kana: "もんだいをかかえる。", ko: "문제를 떠안는다." },
      { jp: "悩みを抱えています。", kana: "なやみをかかえています。", ko: "고민을 안고 있습니다." },
    ],
  },

  // ── い형용사 ──
  {
    id: "surudoi",
    kanji: "鋭い",
    kana: "するどい",
    meaning: "날카롭다 · 예리하다",
    level: "N2",
    type: { kind: "i-adj" },
    hanja: [{ char: "鋭", reading: "날카로울 예" }],
    examples: [
      { jp: "鋭いナイフ。", kana: "するどいナイフ。", ko: "날카로운 칼." },
      { jp: "鋭い質問ですね。", kana: "するどいしつもんですね。", ko: "예리한 질문이네요." },
    ],
  },
  {
    id: "hageshii",
    kanji: "激しい",
    kana: "はげしい",
    meaning: "격렬하다 · 심하다",
    level: "N2",
    type: { kind: "i-adj" },
    hanja: [{ char: "激", reading: "격할 격" }],
    examples: [
      { jp: "激しい雨。", kana: "はげしいあめ。", ko: "거센 비." },
      { jp: "競争が激しい。", kana: "きょうそうがはげしい。", ko: "경쟁이 치열하다." },
    ],
  },
  {
    id: "mazushii",
    kanji: "貧しい",
    kana: "まずしい",
    meaning: "가난하다",
    level: "N2",
    type: { kind: "i-adj" },
    hanja: [{ char: "貧", reading: "가난할 빈" }],
    examples: [
      { jp: "貧しい暮らし。", kana: "まずしいくらし。", ko: "가난한 생활." },
      { jp: "昔は貧しかった。", kana: "むかしはまずしかった。", ko: "옛날엔 가난했다." },
    ],
  },

  // ── な형용사 ──
  {
    id: "bimyou",
    kanji: "微妙",
    kana: "びみょう",
    meaning: "미묘함",
    level: "N2",
    type: { kind: "na-adj" },
    hanja: [
      { char: "微", reading: "작을 미" },
      { char: "妙", reading: "묘할 묘" },
    ],
    examples: [
      { jp: "微妙な違い。", kana: "びみょうなちがい。", ko: "미묘한 차이." },
      { jp: "味が微妙です。", kana: "あじがびみょうです。", ko: "맛이 미묘합니다." },
    ],
  },
  {
    id: "meikaku",
    kanji: "明確",
    kana: "めいかく",
    meaning: "명확함",
    level: "N2",
    type: { kind: "na-adj" },
    hanja: [
      { char: "明", reading: "밝을 명" },
      { char: "確", reading: "굳을 확" },
    ],
    examples: [
      { jp: "明確な答え。", kana: "めいかくなこたえ。", ko: "명확한 답." },
      { jp: "目標を明確にする。", kana: "もくひょうをめいかくにする。", ko: "목표를 명확히 한다." },
    ],
  },
  {
    id: "yutaka",
    kanji: "豊か",
    kana: "ゆたか",
    meaning: "풍부함 · 풍요로움",
    level: "N2",
    type: { kind: "na-adj" },
    hanja: [{ char: "豊", reading: "풍년 풍" }],
    examples: [
      { jp: "豊かな自然。", kana: "ゆたかなしぜん。", ko: "풍부한 자연." },
      { jp: "心が豊かになる。", kana: "こころがゆたかになる。", ko: "마음이 풍요로워진다." },
    ],
  },

  // ── 명사 ──
  {
    id: "kankyou",
    kanji: "環境",
    kana: "かんきょう",
    meaning: "환경",
    level: "N2",
    type: { kind: "noun" },
    hanja: [
      { char: "環", reading: "고리 환" },
      { char: "境", reading: "지경 경" },
    ],
    examples: [
      { jp: "環境を守る。", kana: "かんきょうをまもる。", ko: "환경을 지킨다." },
      { jp: "働く環境がいい。", kana: "はたらくかんきょうがいい。", ko: "일하는 환경이 좋다." },
    ],
  },
  {
    id: "seido",
    kanji: "制度",
    kana: "せいど",
    meaning: "제도",
    level: "N2",
    type: { kind: "noun" },
    hanja: [
      { char: "制", reading: "절제할 제" },
      { char: "度", reading: "법도 도" },
    ],
    examples: [
      { jp: "新しい制度。", kana: "あたらしいせいど。", ko: "새로운 제도." },
      { jp: "制度が変わる。", kana: "せいどがかわる。", ko: "제도가 바뀐다." },
    ],
  },
  {
    id: "kouka",
    kanji: "効果",
    kana: "こうか",
    meaning: "효과",
    level: "N2",
    type: { kind: "noun" },
    hanja: [
      { char: "効", reading: "본받을 효" },
      { char: "果", reading: "실과 과" },
    ],
    examples: [
      { jp: "薬の効果。", kana: "くすりのこうか。", ko: "약의 효과." },
      { jp: "効果があります。", kana: "こうかがあります。", ko: "효과가 있습니다." },
    ],
  },
  {
    id: "keikou",
    kanji: "傾向",
    kana: "けいこう",
    meaning: "경향",
    level: "N2",
    type: { kind: "noun" },
    hanja: [
      { char: "傾", reading: "기울 경" },
      { char: "向", reading: "향할 향" },
    ],
    examples: [
      { jp: "増える傾向がある。", kana: "ふえるけいこうがある。", ko: "늘어나는 경향이 있다." },
      { jp: "最近の傾向。", kana: "さいきんのけいこう。", ko: "최근의 경향." },
    ],
  },
  {
    id: "hyougen",
    kanji: "表現",
    kana: "ひょうげん",
    meaning: "표현",
    level: "N2",
    type: { kind: "noun" },
    hanja: [
      { char: "表", reading: "겉 표" },
      { char: "現", reading: "나타날 현" },
    ],
    examples: [
      { jp: "丁寧な表現。", kana: "ていねいなひょうげん。", ko: "정중한 표현." },
      { jp: "気持ちを表現する。", kana: "きもちをひょうげんする。", ko: "마음을 표현한다." },
    ],
  },
  {
    id: "hyouka",
    kanji: "評価",
    kana: "ひょうか",
    meaning: "평가",
    level: "N2",
    type: { kind: "noun" },
    hanja: [
      { char: "評", reading: "평할 평" },
      { char: "価", reading: "값 가" },
    ],
    examples: [
      { jp: "高い評価を受ける。", kana: "たかいひょうかをうける。", ko: "높은 평가를 받는다." },
      { jp: "結果を評価する。", kana: "けっかをひょうかする。", ko: "결과를 평가한다." },
    ],
  },
];
