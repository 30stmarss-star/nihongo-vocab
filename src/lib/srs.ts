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
const INTERVALS_DAYS = [0.2, 1, 3, 7, 16, 35];

/** 한 번도 안 본 단어의 기본 가중치 */
const NEW_WEIGHT = 1.2;
/** 아직 복습 시점이 안 된 단어가 "가끔" 튀어나올 최소 가중치 */
const FLOOR_WEIGHT = 0.05;
/** 촬영으로 넣은(아직 못 외운) 단어에 줄 가중치 배수 — 우선하되 독점하지 않게 */
const SCAN_BOOST = 2.5;

export function defaultProgress(): Progress {
  return { mastery: 0, lastSeen: 0, seenCount: 0 };
}

/** "외운 단어"로 볼 기준 (한 번이라도 체크해서 숙련도가 붙은 상태) */
export function isKnown(p: Progress | undefined): boolean {
  return !!p && p.seenCount > 0 && p.mastery >= 1;
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
    const base = Math.max(0.35, 1.2 - mastery * 0.17);
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

/** 한 학습지에 새로 도입할 새 단어의 기본 개수 (복습과 골고루 섞이도록 적당히) */
const NEW_PER_SHEET = 7;
/** 아직 안 외운(복습 대기) 단어가 이만큼 쌓이면 새 단어 도입을 줄임 */
const BACKLOG_SOFT = 35;
/** 더 쌓이면 새 단어를 거의 멈추고 밀린 것부터 따라잡게 함 */
const BACKLOG_HARD = 60;

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
 * - 새 단어를 매번 조금씩(NEW_PER_SHEET) 도입하고 나머지는 복습으로 채운다.
 * - 선정은 '중요도 × 복습 만기 × 스캔 보정'을 곱한 가중치의 무작위 추출이라,
 *   중요 단어를 우대하면서도 매번 같은 단어만 반복되지 않는다.
 * - 촬영(priority)으로 넣은 단어는 맨 앞에 고정하지 않고 가중치를 높여 자연스럽게
 *   자주 나오게 한다(우선하되 독점하지 않음). 순서도 매번 섞인다.
 * - 실제 다양성은 App이 학습지에 나온 단어를 touch()로 잠시 쉬게 해 확보한다.
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

  const seen: Word[] = [];
  const fresh: Word[] = [];
  for (const w of pool) {
    const p = progress[w.id];
    if (p && p.seenCount > 0) seen.push(w);
    else fresh.push(w);
  }

  // 아직 안 외운(복습 대기) 단어가 많이 밀리면 새 단어 도입을 줄여 먼저 따라잡게 함
  const backlog = seen.filter((w) => !isKnown(progress[w.id])).length;
  const newCap =
    backlog >= BACKLOG_HARD ? 1 : backlog >= BACKLOG_SOFT ? 3 : NEW_PER_SHEET;

  // 새 단어: 중요도·스캔 보정을 곱한 가중치로 무작위 추출
  const freshWeight = (w: Word) => NEW_WEIGHT * importanceFactor(w.freq) * boost(w);
  const newCount = Math.min(newCap, fresh.length, count);
  const newPicks = weightedSampleBy(fresh, newCount, rand, freshWeight);

  // 복습: 만기 가중치 × 중요도 × 스캔 보정
  const reviewWeight = (w: Word) =>
    weightFor(progress[w.id], now) * importanceFactor(w.freq) * boost(w);
  const reviewPicks = weightedSampleBy(seen, count - newPicks.length, rand, reviewWeight);

  // 그래도 칸이 남으면(초기: 복습 풀이 작음) 남은 새 단어로 채움
  const used = new Set(newPicks.map((w) => w.id));
  const shortfall = count - newPicks.length - reviewPicks.length;
  const extra =
    shortfall > 0
      ? weightedSampleBy(
          fresh.filter((w) => !used.has(w.id)),
          shortfall,
          rand,
          freshWeight
        )
      : [];

  return shuffle([...newPicks, ...reviewPicks, ...extra], rand);
}
