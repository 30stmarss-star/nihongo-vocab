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

// ── 닮은꼴 한자: 외운 묶음(group_id) 로컬 미러 ──
// 클라우드 confusable_progress 테이블과 동기화하기 위한 로컬 캐시.
// 묶음별 { m: 외움여부, t: 마지막 편집시각(ms) } 으로 두어 여러 기기 병합 시
// updated_at(=t) 기준 마지막 편집이 이기도록 한다.
export interface ConfusableMark {
  m: boolean;
  t: number;
}
export type ConfusableMarks = Record<string, ConfusableMark>;

const confusableKey = (uid: string | null) =>
  `nihongo.confusable.memorized.${uid ?? "local"}`;

export function loadConfusableMarks(uid: string | null): ConfusableMarks {
  try {
    const raw = localStorage.getItem(confusableKey(uid));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    // 구버전(string[]) 호환: 전부 외움=true, 시각=0 으로 본다.
    if (Array.isArray(parsed)) {
      const out: ConfusableMarks = {};
      for (const id of parsed) out[String(id)] = { m: true, t: 0 };
      return out;
    }
    return parsed && typeof parsed === "object" ? (parsed as ConfusableMarks) : {};
  } catch {
    return {};
  }
}

export function saveConfusableMarks(uid: string | null, marks: ConfusableMarks): void {
  try {
    localStorage.setItem(confusableKey(uid), JSON.stringify(marks));
  } catch {
    /* 저장 실패는 조용히 무시 */
  }
}
