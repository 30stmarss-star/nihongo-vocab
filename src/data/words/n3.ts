import type { Word } from "../types";

/** N3 핵심 단어 */
export const N3_WORDS: Word[] = [
  // ── 동사 ──
  {
    id: "narau",
    kanji: "習う",
    kana: "ならう",
    meaning: "배우다",
    level: "N3",
    type: { kind: "verb", group: 1 },
    hanja: [{ char: "習", reading: "익힐 습" }],
    examples: [
      { jp: "ピアノを習う。", kana: "ピアノをならう。", ko: "피아노를 배운다." },
      { jp: "茶道を習っています。", kana: "さどうをならっています。", ko: "다도를 배우고 있습니다." },
    ],
  },
  {
    id: "fueru",
    kanji: "増える",
    kana: "ふえる",
    meaning: "늘다 · 증가하다",
    level: "N3",
    type: { kind: "verb", group: 2 },
    hanja: [{ char: "増", reading: "더할 증" }],
    examples: [
      { jp: "人口が増える。", kana: "じんこうがふえる。", ko: "인구가 늘어난다." },
      { jp: "仕事が増えました。", kana: "しごとがふえました。", ko: "일이 늘었습니다." },
    ],
  },
  {
    id: "heru",
    kanji: "減る",
    kana: "へる",
    meaning: "줄다 · 감소하다",
    level: "N3",
    type: { kind: "verb", group: 1 },
    hanja: [{ char: "減", reading: "덜 감" }],
    examples: [
      { jp: "お金が減る。", kana: "おかねがへる。", ko: "돈이 줄어든다." },
      { jp: "体重が減りました。", kana: "たいじゅうがへりました。", ko: "체중이 줄었습니다." },
    ],
  },
  {
    id: "kawaru",
    kanji: "変わる",
    kana: "かわる",
    meaning: "바뀌다 · 변하다",
    level: "N3",
    type: { kind: "verb", group: 1 },
    hanja: [{ char: "変", reading: "변할 변" }],
    examples: [
      { jp: "予定が変わる。", kana: "よていがかわる。", ko: "일정이 바뀐다." },
      { jp: "町が変わりました。", kana: "まちがかわりました。", ko: "동네가 변했습니다." },
    ],
  },
  {
    id: "mamoru",
    kanji: "守る",
    kana: "まもる",
    meaning: "지키다",
    level: "N3",
    type: { kind: "verb", group: 1 },
    hanja: [{ char: "守", reading: "지킬 수" }],
    examples: [
      { jp: "約束を守る。", kana: "やくそくをまもる。", ko: "약속을 지킨다." },
      { jp: "ルールを守りましょう。", kana: "ルールをまもりましょう。", ko: "규칙을 지킵시다." },
    ],
  },
  {
    id: "susumu",
    kanji: "進む",
    kana: "すすむ",
    meaning: "나아가다 · 진행되다",
    level: "N3",
    type: { kind: "verb", group: 1 },
    hanja: [{ char: "進", reading: "나아갈 진" }],
    examples: [
      { jp: "前へ進む。", kana: "まえへすすむ。", ko: "앞으로 나아간다." },
      { jp: "工事が進んでいます。", kana: "こうじがすすんでいます。", ko: "공사가 진행되고 있습니다." },
    ],
  },
  {
    id: "kotowaru",
    kanji: "断る",
    kana: "ことわる",
    meaning: "거절하다",
    level: "N3",
    type: { kind: "verb", group: 1 },
    hanja: [{ char: "断", reading: "끊을 단" }],
    examples: [
      { jp: "誘いを断る。", kana: "さそいをことわる。", ko: "권유를 거절한다." },
      { jp: "丁寧に断りました。", kana: "ていねいにことわりました。", ko: "정중하게 거절했습니다." },
    ],
  },
  {
    id: "mitomeru",
    kanji: "認める",
    kana: "みとめる",
    meaning: "인정하다",
    level: "N3",
    type: { kind: "verb", group: 2 },
    hanja: [{ char: "認", reading: "알 인" }],
    examples: [
      { jp: "失敗を認める。", kana: "しっぱいをみとめる。", ko: "실패를 인정한다." },
      { jp: "彼の力を認めました。", kana: "かれのちからをみとめました。", ko: "그의 능력을 인정했습니다." },
    ],
  },

  // ── い형용사 ──
  {
    id: "kurushii",
    kanji: "苦しい",
    kana: "くるしい",
    meaning: "괴롭다 · 힘들다",
    level: "N3",
    type: { kind: "i-adj" },
    hanja: [{ char: "苦", reading: "쓸 고" }],
    examples: [
      { jp: "息が苦しい。", kana: "いきがくるしい。", ko: "숨이 막힌다." },
      { jp: "生活が苦しいです。", kana: "せいかつがくるしいです。", ko: "생활이 힘듭니다." },
    ],
  },
  {
    id: "kibishii",
    kanji: "厳しい",
    kana: "きびしい",
    meaning: "엄하다 · 혹독하다",
    level: "N3",
    type: { kind: "i-adj" },
    hanja: [{ char: "厳", reading: "엄할 엄" }],
    examples: [
      { jp: "厳しい先生。", kana: "きびしいせんせい。", ko: "엄한 선생님." },
      { jp: "冬は寒さが厳しい。", kana: "ふゆはさむさがきびしい。", ko: "겨울은 추위가 혹독하다." },
    ],
  },
  {
    id: "kuwashii",
    kanji: "詳しい",
    kana: "くわしい",
    meaning: "자세하다 · 정통하다",
    level: "N3",
    type: { kind: "i-adj" },
    hanja: [{ char: "詳", reading: "자세할 상" }],
    examples: [
      { jp: "詳しい説明。", kana: "くわしいせつめい。", ko: "자세한 설명." },
      { jp: "彼は歴史に詳しい。", kana: "かれはれきしにくわしい。", ko: "그는 역사에 정통하다." },
    ],
  },

  // ── な형용사 ──
  {
    id: "fukuzatsu",
    kanji: "複雑",
    kana: "ふくざつ",
    meaning: "복잡함",
    level: "N3",
    type: { kind: "na-adj" },
    hanja: [
      { char: "複", reading: "겹칠 복" },
      { char: "雑", reading: "섞일 잡" },
    ],
    examples: [
      { jp: "複雑な問題。", kana: "ふくざつなもんだい。", ko: "복잡한 문제." },
      { jp: "気持ちが複雑です。", kana: "きもちがふくざつです。", ko: "기분이 복잡합니다." },
    ],
  },
  {
    id: "juuyou",
    kanji: "重要",
    kana: "じゅうよう",
    meaning: "중요함",
    level: "N3",
    type: { kind: "na-adj" },
    hanja: [
      { char: "重", reading: "무거울 중" },
      { char: "要", reading: "요긴할 요" },
    ],
    examples: [
      { jp: "重要な会議。", kana: "じゅうようなかいぎ。", ko: "중요한 회의." },
      { jp: "これは重要な点です。", kana: "これはじゅうようなてんです。", ko: "이것은 중요한 점입니다." },
    ],
  },
  {
    id: "hitsuyou",
    kanji: "必要",
    kana: "ひつよう",
    meaning: "필요함",
    level: "N3",
    type: { kind: "na-adj" },
    hanja: [
      { char: "必", reading: "반드시 필" },
      { char: "要", reading: "요긴할 요" },
    ],
    examples: [
      { jp: "必要な物。", kana: "ひつようなもの。", ko: "필요한 물건." },
      { jp: "予約が必要です。", kana: "よやくがひつようです。", ko: "예약이 필요합니다." },
    ],
  },

  // ── 명사 ──
  {
    id: "keiken",
    kanji: "経験",
    kana: "けいけん",
    meaning: "경험",
    level: "N3",
    type: { kind: "noun" },
    hanja: [
      { char: "経", reading: "지날 경" },
      { char: "験", reading: "시험할 험" },
    ],
    examples: [
      { jp: "いい経験になる。", kana: "いいけいけんになる。", ko: "좋은 경험이 된다." },
      { jp: "経験が足りない。", kana: "けいけんがたりない。", ko: "경험이 부족하다." },
    ],
  },
  {
    id: "kekka",
    kanji: "結果",
    kana: "けっか",
    meaning: "결과",
    level: "N3",
    type: { kind: "noun" },
    hanja: [
      { char: "結", reading: "맺을 결" },
      { char: "果", reading: "실과 과" },
    ],
    examples: [
      { jp: "試験の結果。", kana: "しけんのけっか。", ko: "시험 결과." },
      { jp: "結果が出ました。", kana: "けっかがでました。", ko: "결과가 나왔습니다." },
    ],
  },
  {
    id: "genin",
    kanji: "原因",
    kana: "げんいん",
    meaning: "원인",
    level: "N3",
    type: { kind: "noun" },
    hanja: [
      { char: "原", reading: "근원 원" },
      { char: "因", reading: "인할 인" },
    ],
    examples: [
      { jp: "事故の原因。", kana: "じこのげんいん。", ko: "사고의 원인." },
      { jp: "原因を調べる。", kana: "げんいんをしらべる。", ko: "원인을 조사한다." },
    ],
  },
  {
    id: "mokuteki",
    kanji: "目的",
    kana: "もくてき",
    meaning: "목적",
    level: "N3",
    type: { kind: "noun" },
    hanja: [
      { char: "目", reading: "눈 목" },
      { char: "的", reading: "과녁 적" },
    ],
    examples: [
      { jp: "旅行の目的。", kana: "りょこうのもくてき。", ko: "여행의 목적." },
      { jp: "目的を決める。", kana: "もくてきをきめる。", ko: "목적을 정한다." },
    ],
  },
  {
    id: "kankei",
    kanji: "関係",
    kana: "かんけい",
    meaning: "관계",
    level: "N3",
    type: { kind: "noun" },
    hanja: [
      { char: "関", reading: "관계할 관" },
      { char: "係", reading: "맬 계" },
    ],
    examples: [
      { jp: "二人の関係。", kana: "ふたりのかんけい。", ko: "두 사람의 관계." },
      { jp: "仕事に関係がある。", kana: "しごとにかんけいがある。", ko: "일과 관계가 있다." },
    ],
  },
  {
    id: "naiyou",
    kanji: "内容",
    kana: "ないよう",
    meaning: "내용",
    level: "N3",
    type: { kind: "noun" },
    hanja: [
      { char: "内", reading: "안 내" },
      { char: "容", reading: "얼굴 용" },
    ],
    examples: [
      { jp: "本の内容。", kana: "ほんのないよう。", ko: "책의 내용." },
      { jp: "内容を確認する。", kana: "ないようをかくにんする。", ko: "내용을 확인한다." },
    ],
  },

  // ── 부사 ──
  {
    id: "kanarazu",
    kanji: "必ず",
    kana: "かならず",
    meaning: "반드시",
    level: "N3",
    type: { kind: "adverb" },
    hanja: [{ char: "必", reading: "반드시 필" }],
    examples: [
      { jp: "必ず行きます。", kana: "かならずいきます。", ko: "반드시 가겠습니다." },
      { jp: "必ず連絡してください。", kana: "かならずれんらくしてください。", ko: "반드시 연락해 주세요." },
    ],
  },
  {
    id: "tatoeba",
    kanji: "例えば",
    kana: "たとえば",
    meaning: "예를 들면",
    level: "N3",
    type: { kind: "adverb" },
    hanja: [{ char: "例", reading: "법식 례" }],
    examples: [
      { jp: "例えば、これはどう。", kana: "たとえば、これはどう。", ko: "예를 들면 이건 어때." },
      { jp: "例えば日本語です。", kana: "たとえばにほんごです。", ko: "예를 들면 일본어입니다." },
    ],
  },
  {
    id: "kyuuni",
    kanji: "急に",
    kana: "きゅうに",
    meaning: "갑자기",
    level: "N3",
    type: { kind: "adverb" },
    hanja: [{ char: "急", reading: "급할 급" }],
    examples: [
      { jp: "急に雨が降る。", kana: "きゅうにあめがふる。", ko: "갑자기 비가 온다." },
      { jp: "急に予定が変わった。", kana: "きゅうによていがかわった。", ko: "갑자기 일정이 바뀌었다." },
    ],
  },
];
