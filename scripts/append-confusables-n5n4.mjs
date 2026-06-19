// N5/N4 닮은꼴 보강 세트를 confusables.json의 groups에 추가하고
// cards_flat을 groups로부터 다시 생성한다. 1회성 스크립트.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(__dir, "../src/data/confusables.json");

const k = (kanji, distinguish_ko, meaning_ko, reading_key, word, reading, ko) => ({
  kanji,
  distinguish_ko,
  meaning_ko,
  reading_key,
  example: { word, reading, meaning_ko: ko },
});

const NEW_GROUPS = [
  { group_label: "手 vs 毛 (아래 획)", kanji: [
    k("手", "마지막이 곧게 내려와 갈고리(亅)", "손", "て·シュ", "手", "て", "손"),
    k("毛", "마지막 획이 오른쪽 위로 휘어 올라감", "털", "け·モウ", "毛", "け", "털"),
  ]},
  { group_label: "小 vs 少 (삐침 한 획)", kanji: [
    k("小", "가운데 갈고리 + 양옆 점, 획 적음", "작다", "ちい(さい)·ショウ", "小さい", "ちいさい", "작다"),
    k("少", "小 위에 삐침(ノ) 한 획이 더 있음", "적다", "すく(ない)·ショウ", "少ない", "すくない", "적다"),
  ]},
  { group_label: "方 vs 万 (머리 점)", kanji: [
    k("方", "맨 위에 점(丶)이 있는 亠 머리", "방향·분", "かた·ホウ", "方法", "ほうほう", "방법"),
    k("万", "점 없이 一로 시작, 획 더 적음", "만(10000)", "マン·バン", "一万", "いちまん", "1만"),
  ]},
  { group_label: "天 vs 夫 (윗부분)", kanji: [
    k("天", "윗 가로획이 짧음(아래가 더 긺)", "하늘", "テン·あめ", "天気", "てんき", "날씨"),
    k("夫", "가로 2획에 세로가 맨 위로 뚫고 나옴", "남편", "おっと·フ", "夫", "おっと", "남편"),
  ]},
  { group_label: "同 vs 向 (冂 속)", kanji: [
    k("同", "위가 평평한 가로(一)", "같다", "おな(じ)·ドウ", "同じ", "おなじ", "같다"),
    k("向", "왼쪽 위에 삐침(丿)이 튀어나옴", "향하다", "む(く)·コウ", "向く", "むく", "향하다"),
  ]},
  { group_label: "見 vs 貝 (아래 부품)", kanji: [
    k("見", "目 아래가 儿(두 다리)", "보다", "み(る)·ケン", "見る", "みる", "보다"),
    k("貝", "目 아래가 八(두 점)", "조개", "かい·バイ", "貝", "かい", "조개"),
  ]},
  { group_label: "母 vs 毎 (머리)", kanji: [
    k("母", "머리 없는 기본자, 점 2개", "어머니", "はは·ボ", "母", "はは", "어머니"),
    k("毎", "母 위에 𠂉(ノ+一) 머리가 얹힘", "매번", "マイ·ごと", "毎日", "まいにち", "매일"),
  ]},
  { group_label: "化 vs 花 (초두 유무)", kanji: [
    k("化", "亻+匕만, 머리 없음", "되다·변하다", "カ·ケ·ば(ける)", "文化", "ぶんか", "문화"),
    k("花", "化 위에 艹(초두머리)가 있음", "꽃", "はな·カ", "花", "はな", "꽃"),
  ]},
  { group_label: "門 안에 무엇이 (聞·開·間·問·閉)", kanji: [
    k("聞", "門 안에 耳(귀)", "듣다", "き(く)·ブン", "聞く", "きく", "듣다"),
    k("開", "門 안에 廾(받쳐든 두 손)", "열다", "ひら(く)·あ(ける)·カイ", "開ける", "あける", "열다"),
    k("間", "門 안에 日(날)", "사이·시간", "あいだ·カン", "時間", "じかん", "시간"),
    k("問", "門 안에 口(입)", "묻다", "と(う)·モン", "問題", "もんだい", "문제"),
    k("閉", "門 안에 才(빗장)", "닫다", "し(める)·と(じる)·ヘイ", "閉める", "しめる", "닫다"),
  ]},
  { group_label: "雨 머리 아래 무엇이 (雪·雲·電)", kanji: [
    k("雪", "雨 아래에 ヨ(빗자루 모양)", "눈", "ゆき·セツ", "雪", "ゆき", "눈"),
    k("雲", "雨 아래에 云", "구름", "くも·ウン", "雲", "くも", "구름"),
    k("電", "雨 아래에 电(申, 번개)", "전기", "デン", "電気", "でんき", "전기"),
  ]},
  { group_label: "左 vs 友 vs 有 (ナ 머리 아래)", kanji: [
    k("左", "ナ 아래가 工(장인 공)", "왼쪽", "ひだり·サ", "左", "ひだり", "왼쪽"),
    k("友", "ナ 아래가 又(또 우)", "친구", "とも·ユウ", "友達", "ともだち", "친구"),
    k("有", "ナ 아래가 月(달 월)", "있다·가지다", "あ(る)·ユウ", "有名", "ゆうめい", "유명"),
  ]},
  { group_label: "名 vs 各 (윗부분)", kanji: [
    k("名", "위가 夕(저녁 석) + 아래 口", "이름", "な·メイ", "名前", "なまえ", "이름"),
    k("各", "위가 夂(뒤져올 치) + 아래 口", "각각", "おのおの·カク", "各自", "かくじ", "각자"),
  ]},
];

const data = JSON.parse(readFileSync(FILE, "utf8"));
const existingLabels = new Set(data.groups.map((g) => g.group_label));
let n = data.groups.length;
let added = 0;
for (const g of NEW_GROUPS) {
  if (existingLabels.has(g.group_label)) continue;
  n += 1;
  data.groups.push({ group_id: `g${String(n).padStart(2, "0")}`, group_label: g.group_label, kanji: g.kanji });
  existingLabels.add(g.group_label);
  added += 1;
}

data.cards_flat = data.groups.flatMap((g) =>
  g.kanji.map((kk) => ({
    group_id: g.group_id,
    group_label: g.group_label,
    kanji: kk.kanji,
    distinguish_ko: kk.distinguish_ko,
    meaning_ko: kk.meaning_ko,
    reading_key: kk.reading_key,
    example_word: kk.example.word,
    example_reading: kk.example.reading,
    example_meaning_ko: kk.example.meaning_ko,
  }))
);

writeFileSync(FILE, JSON.stringify(data, null, 2) + "\n", "utf8");
console.log(`added ${added} groups → total ${data.groups.length} groups, ${data.cards_flat.length} cards_flat`);
