// 가나(히라가나/가타카나) → 한국어 독음(근사) 변환 + 퍼지 매칭.
// 시험 타이핑에서 사용자가 한글로 적은 독음(にる→니루, じかん→지칸)을 인정하기 위함.
// 일본어↔한국어 음운이 1:1이 아니므로(카/가 등) 자모 편집거리 기반 '적당히 비슷하면' 통과.

const YOUON: Record<string, string> = {
  きゃ: "캬", きゅ: "큐", きょ: "쿄", ぎゃ: "갸", ぎゅ: "규", ぎょ: "교",
  しゃ: "샤", しゅ: "슈", しょ: "쇼", じゃ: "자", じゅ: "주", じょ: "조",
  ちゃ: "차", ちゅ: "추", ちょ: "초", にゃ: "냐", にゅ: "뉴", にょ: "뇨",
  ひゃ: "햐", ひゅ: "휴", ひょ: "효", びゃ: "뱌", びゅ: "뷰", びょ: "뵤",
  ぴゃ: "퍄", ぴゅ: "퓨", ぴょ: "표", みゃ: "먀", みゅ: "뮤", みょ: "묘",
  りゃ: "랴", りゅ: "류", りょ: "료",
};
const MONO: Record<string, string> = {
  あ: "아", い: "이", う: "우", え: "에", お: "오",
  か: "카", き: "키", く: "쿠", け: "케", こ: "코",
  が: "가", ぎ: "기", ぐ: "구", げ: "게", ご: "고",
  さ: "사", し: "시", す: "스", せ: "세", そ: "소",
  ざ: "자", じ: "지", ず: "즈", ぜ: "제", ぞ: "조",
  た: "타", ち: "치", つ: "츠", て: "테", と: "토",
  だ: "다", ぢ: "지", づ: "즈", で: "데", ど: "도",
  な: "나", に: "니", ぬ: "누", ね: "네", の: "노",
  は: "하", ひ: "히", ふ: "후", へ: "헤", ほ: "호",
  ば: "바", び: "비", ぶ: "부", べ: "베", ぼ: "보",
  ぱ: "파", ぴ: "피", ぷ: "푸", ぺ: "페", ぽ: "포",
  ま: "마", み: "미", む: "무", め: "메", も: "모",
  や: "야", ゆ: "유", よ: "요",
  ら: "라", り: "리", る: "루", れ: "레", ろ: "로",
  わ: "와", ゐ: "이", ゑ: "에", を: "오",
  ぁ: "아", ぃ: "이", ぅ: "우", ぇ: "에", ぉ: "오", ゃ: "야", ゅ: "유", ょ: "요",
};

const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ".split("");
const JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ".split("");
const JONG = ["", ..."ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ".split("")];

/** 완성형 음절에 종성을 추가 (종성 없을 때만). ん → ㄴ받침 처리용. */
function addJong(syl: string, jong: number): string {
  const code = syl.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return syl;
  if ((code - 0xac00) % 28 !== 0) return syl; // 이미 종성 있음
  return String.fromCharCode(code + jong);
}

const kataToHira = (s: string) =>
  s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/** 가나 독음 → 한국어 근사 표기 (예: にる→니루, じかん→지칸) */
export function kanaToHangul(kana: string): string {
  const h = kataToHira(kana);
  const out: string[] = [];
  for (let i = 0; i < h.length; i++) {
    const two = h.slice(i, i + 2);
    if (YOUON[two]) {
      out.push(YOUON[two]);
      i++;
      continue;
    }
    const c = h[i];
    if (c === "ん") {
      if (out.length) out[out.length - 1] = addJong(out[out.length - 1], 4); // ㄴ
      else out.push("ㄴ");
      continue;
    }
    if (c === "っ" || c === "ー" || c === "ｰ") continue; // 촉음·장음은 무시(퍼지)
    out.push(MONO[c] ?? c);
  }
  return out.join("");
}

/** 한글 문자열 → 자모 나열(퍼지 비교용) */
function toJamo(s: string): string {
  let r = "";
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const idx = code - 0xac00;
      r += CHO[Math.floor(idx / 588)] + JUNG[Math.floor((idx % 588) / 28)] + JONG[idx % 28];
    } else r += ch;
  }
  return r;
}

function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[n];
}

const ratio = (a: string, b: string) =>
  !a && !b ? 1 : 1 - lev(a, b) / Math.max(a.length, b.length);

const norm = (s: string) => s.trim().replace(/\s+/g, "");

/**
 * 시험 답 채점: 히라가나/가타카나/한자 직접 일치 OR 한국어 독음 근사 일치(퍼지).
 * '적당히 비슷하게' 써도 통과하도록 자모 편집거리 0.6 이상이면 정답.
 */
export function readingMatches(input: string, kana: string, kanji: string): boolean {
  const inp = norm(input);
  if (!inp) return false;
  // 1) 일본어 그대로 입력 (가타카나→히라 정규화)
  if (kataToHira(inp) === kataToHira(norm(kana))) return true;
  if (inp === norm(kanji)) return true;
  // 2) 한국어 독음 퍼지 매칭
  if (!/[가-힣]/.test(inp)) return false;
  return ratio(toJamo(inp), toJamo(kanaToHangul(kana))) >= 0.6;
}
