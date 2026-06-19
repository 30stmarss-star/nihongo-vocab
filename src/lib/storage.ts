import type { Band } from "../data/types";
import type { ProgressMap } from "./srs";

/** localStorage 기반 영속화 (개인용 MVP). 나중에 서버 동기화로 교체 가능. */

const PROGRESS_KEY = "nihongo.progress.v1";
const BAND_KEY = "nihongo.band.v1";

export function loadProgress(): ProgressMap {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    return raw ? (JSON.parse(raw) as ProgressMap) : {};
  } catch {
    return {};
  }
}

export function saveProgress(p: ProgressMap): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    /* 저장 실패는 조용히 무시 */
  }
}

export function loadBand(): Band | null {
  const raw = localStorage.getItem(BAND_KEY);
  return raw === "N5N4" || raw === "N3" || raw === "N2" ? raw : null;
}

export function saveBand(band: Band): void {
  localStorage.setItem(BAND_KEY, band);
}

// ── 닮은꼴 한자: 외운 묶음(group_id) 목록 ──
// 클라우드 progress 테이블은 words 외래키에 묶여 있어 닮은꼴 그룹을 못 넣는다.
// 그래서 닮은꼴은 기기별 localStorage(유저 구분 키)로만 보관한다.
const confusableKey = (uid: string | null) =>
  `nihongo.confusable.memorized.${uid ?? "local"}`;

export function loadConfusableMemorized(uid: string | null): string[] {
  try {
    const raw = localStorage.getItem(confusableKey(uid));
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? (arr as string[]) : [];
  } catch {
    return [];
  }
}

export function saveConfusableMemorized(uid: string | null, ids: string[]): void {
  try {
    localStorage.setItem(confusableKey(uid), JSON.stringify(ids));
  } catch {
    /* 저장 실패는 조용히 무시 */
  }
}
