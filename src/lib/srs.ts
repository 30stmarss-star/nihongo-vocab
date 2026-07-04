import type { Word } from "../data/types";

/**
 * 가벼운 간격 반복(SRS) 알고리즘.
 *
 * 각 단어의 진행 상태(Progress)를 바탕으로 학습지에 등장할 "가중치"를 계산한다.
 * - 모른다 표시 → 숙련도 0 → 짧게 쉬었다가 다시 등장(매번은 아님)
 * - 안다 표시 → 숙련도 상승 → 복습 시점까지 한동안 안 보임
 * - 학습지에 한 번 나온 단어는 잠시 쉬게 해서(touch), "새 학습지"를 눌러도
 *   방금 본 단어가 또 나오지 않도록 다양성을 확보한다.
 */

export interface Progress {
  mastery: number; // 0(전혀 모름) ~ 5(완전 암기)
  lastSeen: number; // epoch ms, 마지막으로 학습지에 나오거나 안다/모른다 표시한 시각
  seenCount: number;
}

export type ProgressMap = Record<string, Progress>;

const DAY = 24 * 60 * 60 * 1000;

/**
 * 숙련도 단계별 복습 간격(일). 이 시간이 지나야 다시 후보가 된다.
 * mastery 0(아직 못 외움)도 0이 아니라 살짝 쉬게 해서, 한 번 나온 뒤
 * 바로 다음 학습지에 또 나오지 않고 "좀 있다가" 돌아오게 한다.
 */
const INTERVALS_DAYS = [0.4, 1, 3, 7, 16, 35];

/** 한 번도 안 본 단어의 기본 가중치 */
const NEW_WEIGHT = 1.2;
/** 아직 복습 시점이 안 된 단어가 "가끔" 튀어나올 최소 가중치 */
const FLOOR_WEIGHT = 0.05;
/** 촬영으로 넣은(아직 못 외운) 단어에 줄 가중치 배수 — 우선하되 독점하지 않게 */
const SCAN_BOOST = 2.5;

/**
 * '왕체크'(완전 암기) 센티넬 숙련도.
 * 일반 학습은 markKnown이 min(5, …)로 최대 5까지만 올리므로, 자연스러운 mastery는 0~5.
 * 그보다 큰 6을 "다시 안 봐도 되는 완전 암기(은퇴)" 신호로 쓴다 → DB 마이그레이션 불필요.
 */
export const RETIRED_MASTERY = 6;

export function defaultProgress(): Progress {
  return { mastery: 0, lastSeen: 0, seenCount: 0 };
}

/** "외운 단어"로 볼 기준 (한 번이라도 체크해서 숙련도가 붙은 상태 — 왕체크 포함) */
export function isKnown(p: Progress | undefined): boolean {
  return !!p && p.seenCount > 0 && p.mastery >= 1;
}

/** '왕체크'(완전 암기): 학습지에 더 이상 등장하지 않는다. */
export function isRetired(p: Progress | undefined): boolean {
  return !!p && p.mastery >= RETIRED_MASTERY;
}

/** 왕체크 표시: 학습지에서 완전히 빼되 '외운 단어'에는 남긴다. */
export function markRetired(p: Progress, now: number): Progress {
  return {
    mastery: RETIRED_MASTERY,
    lastSeen: now,
    seenCount: p.seenCount + 1,
  };
}

/** 학습지에 처음 등장한(아직 안 본) 단어를 '도입됨' 상태로 기록 */
export function introduce(p: Progress | undefined, now: number): Progress {
  if (p && p.seenCount > 0) return p;
  return { mastery: 0, lastSeen: now, seenCount: 1 };
}

/**
 * 학습지에 '나왔다'고 표시 → lastSeen을 지금으로 갱신해 잠시 쉬게 한다.
 * 처음 나온 단어는 도입 처리. 이미 본 단어는 숙련도는 유지하고 시각만 갱신.
 * (변화가 없으면 같은 객체를 그대로 돌려줘 불필요한 저장을 피한다.)
 */
export function touch(p: Progress | undefined, now: number): Progress {
  if (!p || p.seenCount === 0) return { mastery: 0, lastSeen: now, seenCount: 1 };
  return { mastery: p.mastery, lastSeen: now, seenCount: p.seenCount };
}

/** 중요도(freq)를 '부드러운' 배수로. 결정적 정렬이 아니라 확률 가중치라 매번 다양하다. */
function importanceFactor(freq?: number): number {
  const f = freq ?? 2;
  return f <= 1 ? 1.5 : f === 2 ? 1.0 : 0.7;
}

/** 학습지 등장 기본 가중치(복습 만기 기준) */
export function weightFor(p: Progress | undefined, now: number): number {
  if (!p || p.seenCount === 0) return NEW_WEIGHT;

  const mastery = Math.min(p.mastery, 5);
  const interval = INTERVALS_DAYS[mastery] * DAY;
  const elapsed = now - p.lastSeen;

  if (elapsed >= interval) {
    // 복습 시점 도달: 기본 가중치는 숙련도가 높을수록 낮고,
    // 복습 시점을 많이 넘겼을수록 조금씩 더 올라간다.
    // 못 외운(mastery 0) 단어도 새 단어(NEW_WEIGHT 1.2)보다는 한 단계 아래(0.9)에서 시작 —
    // 복습은 하되 새 단어를 밀어내며 반복 도배되지 않게.
    const base = Math.max(0.35, 0.9 - mastery * 0.11);
    const overdue = interval <= 0 ? 1 : Math.min(elapsed / interval, 3);
    return base * (0.8 + 0.2 * overdue);
  }

  // 아직 쉬는 중(최근에 나왔거나 맞힌 단어): 거의 안 나오지만 완전히 0은 아님.
  return FLOOR_WEIGHT;
}

/** 안다 표시 */
export function markKnown(p: Progress, now: number): Progress {
  return {
    mastery: Math.min(5, p.mastery + 1),
    lastSeen: now,
    seenCount: p.seenCount + 1,
  };
}

/** 체크 해제(모름으로 되돌리기): 숙련도를 0으로 리셋해 짧은 간격 뒤 다시 등장하게 한다. */
export function markUnknown(p: Progress, now: number): Progress {
  return {
    mastery: 0,
    lastSeen: now,
    seenCount: p.seenCount + 1,
  };
}

// ── 학습지 구성(30문항 기준) — 표준 단어앱(고정 복습 몫 + 상한) 방식 ──
/** 외운 단어 복습 몫: 학습지의 30%(상한 KNOWN_CAP). 간격과 무관하게 매번 안정적으로 복습을 끼워준다. */
const KNOWN_SHARE = 0.3;
const KNOWN_CAP = 10;
/** 같은 세션에서 방금 나온 외운 단어가 곧바로 또 나오지 않게 하는 휴식(1시간). 하루 뒤엔 모두 다시 후보. */
const KNOWN_REST_MS = 60 * 60 * 1000;
/** 새 단어 기본 도입 수. '오늘 만기된 못 외운 단어'가 밀리면 줄인다(완전히 멈추진 않음). */
const NEW_BASE = 6;
const DUE_LEARN_SOFT = 15; // 오늘 만기된 못외운 단어 ≥15 → 새 단어 4
const DUE_LEARN_HARD = 30; // ≥30 → 새 단어 2
/** 못 외운 단어의 복습 만기 간격(=간격반복 0단계). 이 시간이 지나야 다시 후보(세션 내 재탕 방지). */
const LEARN_INTERVAL_MS = INTERVALS_DAYS[0] * DAY;

/** 가중치 비복원 추출 (weightFn으로 항목별 가중치 계산) */
function weightedSampleBy(
  pool: Word[],
  count: number,
  rand: () => number,
  weightFn: (w: Word) => number
): Word[] {
  const items = pool.map((w) => ({ w, weight: Math.max(0, weightFn(w)) }));
  const picked: Word[] = [];
  const n = Math.min(count, items.length);
  for (let i = 0; i < n; i++) {
    const total = items.reduce((s, it) => s + it.weight, 0);
    let idx = 0;
    if (total <= 0) {
      // 모두 0(전부 쉬는 중)이면 남은 것 중 무작위로 채운다.
      idx = Math.floor(rand() * items.length);
    } else {
      let r = rand() * total;
      for (let j = 0; j < items.length; j++) {
        r -= items[j].weight;
        if (r <= 0) {
          idx = j;
          break;
        }
      }
    }
    picked.push(items[idx].w);
    items.splice(idx, 1);
  }
  return picked;
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 학습지 생성 — 다양성과 간격을 함께 고려한다.
 *
 * 표준 단어앱(고정 복습 몫 + 상한) 방식. 버킷별로 '따로' 추출한다:
 * - 외운 단어 복습 = 고정 몫(30%·상한 10). 간격이 몫의 '존재'를 막지 않고 '순위'만 정한다
 *   → 같은 세션에서도 안정적으로 복습이 끼되(비지 않고), 도배되지도 않는다.
 * - 못 외운 단어 = '오늘 복습 만기'된 것만 후보 → 방금 본 단어가 곧바로 재탕되지 않는다.
 * - 새 단어 = 기본 6개, 밀린 복습(오늘 만기 못외운 수)이 많으면 줄인다.
 * - 부족분은 새단어 → 외운(자격) → 쉬는 못외운(오래된 순) → 쉬는 외운 순으로 백필.
 * - freq(중요도)·스캔 보정은 각 버킷 안 순위에 반영. 순서는 매번 섞는다.
 */
export function buildWorksheet(
  pool: Word[],
  progress: ProgressMap,
  count: number,
  now: number,
  rand: () => number = Math.random,
  priority?: Set<string>
): Word[] {
  const scan = priority;
  const boost = (w: Word) =>
    scan && scan.has(w.id) && !isKnown(progress[w.id]) ? SCAN_BOOST : 1;

  // 1) 버킷 분리(왕체크 제외). 못 외운/외운은 다시 '오늘 복습 만기(due/elig)'와 '휴식(rest)'으로.
  const fresh: Word[] = [];
  const dueLearning: Word[] = [];
  const restLearning: Word[] = [];
  const eligKnown: Word[] = [];
  const restKnown: Word[] = [];
  for (const w of pool) {
    const p = progress[w.id];
    if (isRetired(p)) continue; // 왕체크(완전 암기) → 완전히 제외
    if (!p || p.seenCount === 0) fresh.push(w);
    else if (isKnown(p)) (now - p.lastSeen >= KNOWN_REST_MS ? eligKnown : restKnown).push(w);
    else (now - p.lastSeen >= LEARN_INTERVAL_MS ? dueLearning : restLearning).push(w);
  }

  // 2) 몫 배정: 외운 복습(고정%·상한) / 새 단어(오늘 밀린 만큼 줄임) / 나머지는 못 외운(오늘 만기)
  const knownQuota = Math.min(Math.round(count * KNOWN_SHARE), KNOWN_CAP);
  const newQuota =
    dueLearning.length >= DUE_LEARN_HARD ? 2 : dueLearning.length >= DUE_LEARN_SOFT ? 4 : NEW_BASE;
  const learnQuota = Math.max(0, count - knownQuota - newQuota);

  // 3) 버킷 '안에서'의 우선순위 가중치 (버킷 간 비교 아님).
  const freshW = (w: Word) => importanceFactor(w.freq) * boost(w);
  const learnW = (w: Word) => {
    const r = (now - (progress[w.id]?.lastSeen ?? 0)) / LEARN_INTERVAL_MS;
    return (0.7 + 0.3 * Math.min(r, 3)) * importanceFactor(w.freq) * boost(w);
  };
  const knownW = (w: Word) => {
    const p = progress[w.id]!;
    const iv = INTERVALS_DAYS[Math.min(p.mastery, 5)] * DAY;
    const r = (now - p.lastSeen) / iv;
    // 복습 만기면 우선순위↑, 아니면 만기에 가까울수록↑ (만기 여부가 '몫 존재'를 막지 않고 '순위'만 정함)
    const due = r >= 1 ? 1.5 + 0.5 * Math.min(r - 1, 2) : 0.15 + 0.85 * r;
    return due * (1.15 - 0.1 * Math.min(p.mastery, 5)) * importanceFactor(w.freq);
  };

  // 4) 1차 추출 — 풀이 몫보다 적으면 덜 뽑는다(억지로 채우지 않음 = 방금 본 단어 재탕 방지).
  const learnPicks = weightedSampleBy(dueLearning, Math.min(learnQuota, dueLearning.length), rand, learnW);
  const knownPicks = weightedSampleBy(eligKnown, Math.min(knownQuota, eligKnown.length), rand, knownW);
  const newPicks = weightedSampleBy(fresh, Math.min(newQuota, fresh.length, count), rand, freshW);

  // 5) 부족분 백필(엄격한 우선순위): 새 단어 → 외운(자격) → 쉬는 못외운(오래된 순) → 쉬는 외운(오래된 순).
  //    학습 풀이 얇을 때 '방금 본 못외운 단어'가 아니라 새 단어로 먼저 채워진다.
  const picked: Word[] = [...newPicks, ...learnPicks, ...knownPicks];
  const used = new Set(picked.map((w) => w.id));
  const lruW = (w: Word) => now - (progress[w.id]?.lastSeen ?? 0) + 1; // 오래 안 나온 것일수록↑
  const chain: [Word[], (w: Word) => number][] = [
    [fresh, freshW],
    [eligKnown, knownW],
    [restLearning, lruW],
    [restKnown, lruW],
  ];
  for (const [src, wfn] of chain) {
    const need = count - picked.length;
    if (need <= 0) break;
    const more = weightedSampleBy(src.filter((w) => !used.has(w.id)), need, rand, wfn);
    for (const w of more) used.add(w.id);
    picked.push(...more);
  }

  return shuffle(picked, rand);
}
