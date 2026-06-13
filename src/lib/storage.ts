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
