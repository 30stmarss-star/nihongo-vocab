import type { Word } from "../types";

/** N4 핵심 단어 */
export const N4_WORDS: Word[] = [
  // ── 동사 ──
  {
    id: "tetsudau",
    kanji: "手伝う",
    kana: "てつだう",
    meaning: "돕다",
    level: "N4",
    type: { kind: "verb", group: 1 },
    hanja: [
      { char: "手", reading: "손 수" },
      { char: "伝", reading: "전할 전" },
    ],
    examples: [
      { jp: "母を手伝う。", kana: "ははをてつだう。", ko: "엄마를 돕는다." },
      { jp: "仕事を手伝いました。", kana: "しごとをてつだいました。", ko: "일을 도왔습니다." },
    ],
  },
  {
    id: "oshieru",
    kanji: "教える",
    kana: "おしえる",
    meaning: "가르치다",
    level: "N4",
    type: { kind: "verb", group: 2 },
    hanja: [{ char: "教", reading: "가르칠 교" }],
    examples: [
      { jp: "日本語を教える。", kana: "にほんごをおしえる。", ko: "일본어를 가르친다." },
      { jp: "道を教えてください。", kana: "みちをおしえてください。", ko: "길을 가르쳐 주세요." },
    ],
  },
  {
    id: "kariru",
    kanji: "借りる",
    kana: "かりる",
    meaning: "빌리다",
    level: "N4",
    type: { kind: "verb", group: 2 },
    hanja: [{ char: "借", reading: "빌릴 차" }],
    examples: [
      { jp: "本を借りる。", kana: "ほんをかりる。", ko: "책을 빌린다." },
      { jp: "お金を借りました。", kana: "おかねをかりました。", ko: "돈을 빌렸습니다." },
    ],
  },
  {
    id: "kasu",
    kanji: "貸す",
    kana: "かす",
    meaning: "빌려주다",
    level: "N4",
    type: { kind: "verb", group: 1 },
    hanja: [{ char: "貸", reading: "빌릴 대" }],
    examples: [
      { jp: "傘を貸す。", kana: "かさをかす。", ko: "우산을 빌려준다." },
      { jp: "ペンを貸してください。", kana: "ペンをかしてください。", ko: "펜을 빌려주세요." },
    ],
  },
  {
    id: "isogu",
    kanji: "急ぐ",
    kana: "いそぐ",
    meaning: "서두르다",
    level: "N4",
    type: { kind: "verb", group: 1 },
    hanja: [{ char: "急", reading: "급할 급" }],
    examples: [
      { jp: "駅へ急ぐ。", kana: "えきへいそぐ。", ko: "역으로 서두른다." },
      { jp: "急がないと遅れる。", kana: "いそがないとおくれる。", ko: "서두르지 않으면 늦는다." },
    ],
  },
  {
    id: "hakobu",
    kanji: "運ぶ",
    kana: "はこぶ",
    meaning: "옮기다 · 나르다",
    level: "N4",
    type: { kind: "verb", group: 1 },
    hanja: [{ char: "運", reading: "옮길 운" }],
    examples: [
      { jp: "荷物を運ぶ。", kana: "にもつをはこぶ。", ko: "짐을 나른다." },
      { jp: "机を運びました。", kana: "つくえをはこびました。", ko: "책상을 옮겼습니다." },
    ],
  },
  {
    id: "kimeru",
    kanji: "決める",
    kana: "きめる",
    meaning: "정하다 · 결정하다",
    level: "N4",
    type: { kind: "verb", group: 2 },
    hanja: [{ char: "決", reading: "결단할 결" }],
    examples: [
      { jp: "予定を決める。", kana: "よていをきめる。", ko: "일정을 정한다." },
      { jp: "行く店を決めました。", kana: "いくみせをきめました。", ko: "갈 가게를 정했습니다." },
    ],
  },
  {
    id: "atsumeru",
    kanji: "集める",
    kana: "あつめる",
    meaning: "모으다",
    level: "N4",
    type: { kind: "verb", group: 2 },
    hanja: [{ char: "集", reading: "모을 집" }],
    examples: [
      { jp: "切手を集める。", kana: "きってをあつめる。", ko: "우표를 모은다." },
      { jp: "情報を集めました。", kana: "じょうほうをあつめました。", ko: "정보를 모았습니다." },
    ],
  },
  {
    id: "tsuzukeru",
    kanji: "続ける",
    kana: "つづける",
    meaning: "계속하다",
    level: "N4",
    type: { kind: "verb", group: 2 },
    hanja: [{ char: "続", reading: "이을 속" }],
    examples: [
      { jp: "勉強を続ける。", kana: "べんきょうをつづける。", ko: "공부를 계속한다." },
      { jp: "運動を続けています。", kana: "うんどうをつづけています。", ko: "운동을 계속하고 있습니다." },
    ],
  },
  {
    id: "erabu",
    kanji: "選ぶ",
    kana: "えらぶ",
    meaning: "고르다 · 선택하다",
    level: "N4",
    type: { kind: "verb", group: 1 },
    hanja: [{ char: "選", reading: "가릴 선" }],
    examples: [
      { jp: "好きな色を選ぶ。", kana: "すきないろをえらぶ。", ko: "좋아하는 색을 고른다." },
      { jp: "一つ選びました。", kana: "ひとつえらびました。", ko: "하나 골랐습니다." },
    ],
  },

  // ── い형용사 ──
  {
    id: "isogashii",
    kanji: "忙しい",
    kana: "いそがしい",
    meaning: "바쁘다",
    level: "N4",
    type: { kind: "i-adj" },
    hanja: [{ char: "忙", reading: "바쁠 망" }],
    examples: [
      { jp: "今日は忙しい。", kana: "きょうはいそがしい。", ko: "오늘은 바쁘다." },
      { jp: "毎日忙しいです。", kana: "まいにちいそがしいです。", ko: "매일 바쁩니다." },
    ],
  },
  {
    id: "tanoshii",
    kanji: "楽しい",
    kana: "たのしい",
    meaning: "즐겁다",
    level: "N4",
    type: { kind: "i-adj" },
    hanja: [{ char: "楽", reading: "즐길 락" }],
    examples: [
      { jp: "旅行は楽しい。", kana: "りょこうはたのしい。", ko: "여행은 즐겁다." },
      { jp: "毎日が楽しいです。", kana: "まいにちがたのしいです。", ko: "매일이 즐겁습니다." },
    ],
  },
  {
    id: "muzukashii",
    kanji: "難しい",
    kana: "むずかしい",
    meaning: "어렵다",
    level: "N4",
    type: { kind: "i-adj" },
    hanja: [{ char: "難", reading: "어려울 난" }],
    examples: [
      { jp: "難しい問題。", kana: "むずかしいもんだい。", ko: "어려운 문제." },
      { jp: "日本語は難しい。", kana: "にほんごはむずかしい。", ko: "일본어는 어렵다." },
    ],
  },
  {
    id: "abunai",
    kanji: "危ない",
    kana: "あぶない",
    meaning: "위험하다",
    level: "N4",
    type: { kind: "i-adj" },
    hanja: [{ char: "危", reading: "위태할 위" }],
    examples: [
      { jp: "危ない道。", kana: "あぶないみち。", ko: "위험한 길." },
      { jp: "ここは危ないです。", kana: "ここはあぶないです。", ko: "여기는 위험합니다." },
    ],
  },

  // ── な형용사 ──
  {
    id: "benri",
    kanji: "便利",
    kana: "べんり",
    meaning: "편리함",
    level: "N4",
    type: { kind: "na-adj" },
    hanja: [
      { char: "便", reading: "편할 편" },
      { char: "利", reading: "이로울 리" },
    ],
    examples: [
      { jp: "便利な道具。", kana: "べんりなどうぐ。", ko: "편리한 도구." },
      { jp: "電車は便利です。", kana: "でんしゃはべんりです。", ko: "전철은 편리합니다." },
    ],
  },
  {
    id: "kantan",
    kanji: "簡単",
    kana: "かんたん",
    meaning: "간단함 · 쉬움",
    level: "N4",
    type: { kind: "na-adj" },
    hanja: [
      { char: "簡", reading: "간략할 간" },
      { char: "単", reading: "홑 단" },
    ],
    examples: [
      { jp: "簡単な問題。", kana: "かんたんなもんだい。", ko: "간단한 문제." },
      { jp: "作り方は簡単です。", kana: "つくりかたはかんたんです。", ko: "만드는 법은 간단합니다." },
    ],
  },
  {
    id: "taisetsu",
    kanji: "大切",
    kana: "たいせつ",
    meaning: "소중함 · 중요함",
    level: "N4",
    type: { kind: "na-adj" },
    hanja: [
      { char: "大", reading: "큰 대" },
      { char: "切", reading: "끊을 절" },
    ],
    examples: [
      { jp: "大切な人。", kana: "たいせつなひと。", ko: "소중한 사람." },
      { jp: "時間は大切です。", kana: "じかんはたいせつです。", ko: "시간은 소중합니다." },
    ],
  },
  {
    id: "shinsetsu",
    kanji: "親切",
    kana: "しんせつ",
    meaning: "친절함",
    level: "N4",
    type: { kind: "na-adj" },
    hanja: [
      { char: "親", reading: "친할 친" },
      { char: "切", reading: "끊을 절" },
    ],
    examples: [
      { jp: "親切な店員。", kana: "しんせつなてんいん。", ko: "친절한 점원." },
      { jp: "彼はとても親切です。", kana: "かれはとてもしんせつです。", ko: "그는 매우 친절합니다." },
    ],
  },

  // ── 명사 ──
  {
    id: "yakusoku",
    kanji: "約束",
    kana: "やくそく",
    meaning: "약속",
    level: "N4",
    type: { kind: "noun" },
    hanja: [
      { char: "約", reading: "맺을 약" },
      { char: "束", reading: "묶을 속" },
    ],
    examples: [
      { jp: "友だちと約束する。", kana: "ともだちとやくそくする。", ko: "친구와 약속한다." },
      { jp: "約束を守ります。", kana: "やくそくをまもります。", ko: "약속을 지킵니다." },
    ],
  },
  {
    id: "basho",
    kanji: "場所",
    kana: "ばしょ",
    meaning: "장소",
    level: "N4",
    type: { kind: "noun" },
    hanja: [
      { char: "場", reading: "마당 장" },
      { char: "所", reading: "바 소" },
    ],
    examples: [
      { jp: "会う場所を決める。", kana: "あうばしょをきめる。", ko: "만날 장소를 정한다." },
      { jp: "静かな場所です。", kana: "しずかなばしょです。", ko: "조용한 장소입니다." },
    ],
  },
  {
    id: "setsumei",
    kanji: "説明",
    kana: "せつめい",
    meaning: "설명",
    level: "N4",
    type: { kind: "noun" },
    hanja: [
      { char: "説", reading: "말씀 설" },
      { char: "明", reading: "밝을 명" },
    ],
    examples: [
      { jp: "説明を聞く。", kana: "せつめいをきく。", ko: "설명을 듣는다." },
      { jp: "詳しく説明します。", kana: "くわしくせつめいします。", ko: "자세히 설명하겠습니다." },
    ],
  },
  {
    id: "shumi",
    kanji: "趣味",
    kana: "しゅみ",
    meaning: "취미",
    level: "N4",
    type: { kind: "noun" },
    hanja: [
      { char: "趣", reading: "뜻 취" },
      { char: "味", reading: "맛 미" },
    ],
    examples: [
      { jp: "趣味は何ですか。", kana: "しゅみはなんですか。", ko: "취미가 무엇입니까?" },
      { jp: "私の趣味は音楽です。", kana: "わたしのしゅみはおんがくです。", ko: "제 취미는 음악입니다." },
    ],
  },
  {
    id: "kanji-char",
    kanji: "漢字",
    kana: "かんじ",
    meaning: "한자",
    level: "N4",
    type: { kind: "noun" },
    hanja: [
      { char: "漢", reading: "한수 한" },
      { char: "字", reading: "글자 자" },
    ],
    examples: [
      { jp: "漢字を覚える。", kana: "かんじをおぼえる。", ko: "한자를 외운다." },
      { jp: "漢字は難しい。", kana: "かんじはむずかしい。", ko: "한자는 어렵다." },
    ],
  },
  {
    id: "yotei",
    kanji: "予定",
    kana: "よてい",
    meaning: "예정 · 일정",
    level: "N4",
    type: { kind: "noun" },
    hanja: [
      { char: "予", reading: "미리 예" },
      { char: "定", reading: "정할 정" },
    ],
    examples: [
      { jp: "明日の予定。", kana: "あしたのよてい。", ko: "내일 일정." },
      { jp: "予定が変わりました。", kana: "よていがかわりました。", ko: "일정이 바뀌었습니다." },
    ],
  },
  {
    id: "shitsumon",
    kanji: "質問",
    kana: "しつもん",
    meaning: "질문",
    level: "N4",
    type: { kind: "noun" },
    hanja: [
      { char: "質", reading: "바탕 질" },
      { char: "問", reading: "물을 문" },
    ],
    examples: [
      { jp: "質問がある。", kana: "しつもんがある。", ko: "질문이 있다." },
      { jp: "先生に質問しました。", kana: "せんせいにしつもんしました。", ko: "선생님께 질문했습니다." },
    ],
  },
  {
    id: "kikai",
    kanji: "機会",
    kana: "きかい",
    meaning: "기회",
    level: "N4",
    type: { kind: "noun" },
    hanja: [
      { char: "機", reading: "틀 기" },
      { char: "会", reading: "모일 회" },
    ],
    examples: [
      { jp: "いい機会だ。", kana: "いいきかいだ。", ko: "좋은 기회다." },
      { jp: "機会があれば行きたい。", kana: "きかいがあればいきたい。", ko: "기회가 있으면 가고 싶다." },
    ],
  },
];
