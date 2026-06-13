import type { Word } from "../data/types";

/**
 * 가벼운 간격 반복(SRS) 알고리즘.
 *
 * 각 단어의 진행 상태(Progress)를 바탕으로 학습지에 등장할 "가중치"를 계산한다.
 * - 모른다 표시 → 숙련도 하락 → 가중치 급상승 → 자주 등장
 * - 안다 표시 → 숙련도 상승 → 한동안 가중치 바닥 → 가끔만 등장
 * - 시간이 지나 "복습 시점"이 되면 아는 단어도 가중치가 회복되어 다시 등장
 */

export interface Progress {
  mastery: number; // 0(전혀 모름) ~ 5(완전 암기)
  lastSeen: number; // epoch ms, 마지막으로 안다/모른다 표시한 시각
  seenCount: number;
}

export type ProgressMap = Record<string, Progress>;

const DAY = 24 * 60 * 60 * 1000;

/** 숙련도 단계별 복습 간격(일). 높을수록 오래 안 보임. */
const INTERVALS_DAYS = [0, 1, 3, 7, 16, 35];

/** 한 번도 안 본 단어에 줄 기본 가중치 (살짝 우대) */
const NEW_WEIGHT = 1.4;
/** 아직 복습 시점이 안 된 아는 단어가 "가끔" 튀어나올 최소 가중치 */
const FLOOR_WEIGHT = 0.05;

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

/** 학습지 등장 가중치 계산 */
export function weightFor(p: Progress | undefined, now: number): number {
  if (!p || p.seenCount === 0) return NEW_WEIGHT;

  const mastery = Math.min(p.mastery, 5);
  const interval = INTERVALS_DAYS[mastery] * DAY;
  const elapsed = now - p.lastSeen;

  if (interval === 0 || elapsed >= interval) {
    // 복습 시점 도달: 기본 가중치는 숙련도가 높을수록 낮고,
    // 복습 시점을 많이 넘겼을수록 조금씩 더 올라간다.
    const base = Math.max(0.35, 1.2 - mastery * 0.17);
    const overdue = interval === 0 ? 1 : Math.min(elapsed / interval, 3);
    return base * (0.8 + 0.2 * overdue);
  }

  // 아직 복습 전(최근에 맞힌 단어): 거의 안 나오지만 완전히 0은 아님.
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

/** 체크 해제(모름으로 되돌리기): 숙련도를 0으로 리셋해 다시 자주 등장하게 한다. */
export function markUnknown(p: Progress, now: number): Progress {
  return {
    mastery: 0,
    lastSeen: now,
    seenCount: p.seenCount + 1,
  };
}

/** 한 학습지에 새로 도입할 새 단어의 기본 개수 (속공형: 학습지 1~2장이면 하루 12~24개 신규) */
const NEW_PER_SHEET = 12;
/** 아직 안 외운(복습 대기) 단어가 이만큼 쌓이면 새 단어 도입을 줄임 */
const BACKLOG_SOFT = 35;
/** 더 쌓이면 새 단어를 거의 멈추고 밀린 것부터 따라잡게 함 */
const BACKLOG_HARD = 60;

/** 가중치 비복원 추출 */
function weightedSample(
  pool: Word[],
  progress: ProgressMap,
  count: number,
  now: number,
  rand: () => number
): Word[] {
  const items = pool.map((w) => ({ w, weight: weightFor(progress[w.id], now) }));
  const picked: Word[] = [];
  const n = Math.min(count, items.length);
  for (let i = 0; i < n; i++) {
    const total = items.reduce((s, it) => s + it.weight, 0);
    if (total <= 0) break;
    let r = rand() * total;
    let idx = 0;
    for (let j = 0; j < items.length; j++) {
      r -= items[j].weight;
      if (r <= 0) {
        idx = j;
        break;
      }
    }
    picked.push(items[idx].w);
    items.splice(idx, 1);
  }
  return picked;
}

/** 새 단어 도입용 추출 — 중요도(freq) 낮은(=핵심) 단어부터, 같은 등급은 무작위 */
function pickByImportance(pool: Word[], count: number, rand: () => number): Word[] {
  const sorted = [...pool].sort(
    (a, b) => (a.freq ?? 2) - (b.freq ?? 2) || rand() - 0.5
  );
  return sorted.slice(0, Math.min(count, sorted.length));
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
 * 학습지 생성 — 학습 단계에 따라 단어가 자동으로 확장된다.
 *
 * - 아직 안 본 단어를 매번 조금씩(NEW_PER_SHEET) 도입하고, 나머지는 복습 단어로 채운다.
 * - 안 외운 단어가 많이 밀리면 새 단어 도입을 줄여서 먼저 따라잡게 한다.
 * - 계속 학습하면 결국 그 레벨의 모든 단어가 도입되어, 전부 학습하게 된다.
 */
export function buildWorksheet(
  pool: Word[],
  progress: ProgressMap,
  count: number,
  now: number,
  rand: () => number = Math.random
): Word[] {
  const introduced: Word[] = [];
  const fresh: Word[] = [];
  for (const w of pool) {
    const p = progress[w.id];
    if (p && p.seenCount > 0) introduced.push(w);
    else fresh.push(w);
  }

  // 아직 안 외운(체크 안 한) 도입 단어 수 → 새 단어 도입량 조절
  const backlog = introduced.filter((w) => !isKnown(progress[w.id])).length;
  const newCap =
    backlog >= BACKLOG_HARD ? 1 : backlog >= BACKLOG_SOFT ? 3 : NEW_PER_SHEET;

  const newCount = Math.min(newCap, fresh.length, count);
  const newPicks = pickByImportance(fresh, newCount, rand);
  const reviewPicks = weightedSample(
    introduced,
    progress,
    count - newCount,
    now,
    rand
  );

  // 복습 풀이 작아 칸이 남으면(특히 맨 처음: 본 단어가 0개) 새 단어로 마저 채워
  // 학습지를 항상 count만큼 채운다. 복습이 쌓이면 자연히 채울 일이 없어진다.
  const shortfall = count - newPicks.length - reviewPicks.length;
  const extraPicks =
    shortfall > 0
      ? pickByImportance(
          fresh.filter((w) => !newPicks.includes(w)),
          shortfall,
          rand
        )
      : [];

  return shuffle([...newPicks, ...reviewPicks, ...extraPicks], rand);
}
