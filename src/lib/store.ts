import { WORDS as LOCAL_WORDS } from "../data/words";
import type { Band, Word, WordType } from "../data/types";
import type { Progress, ProgressMap } from "./srs";
import { loadBand, loadProgress, saveBand, saveProgress } from "./storage";
import { CLOUD, supabase } from "./supabase";

/**
 * 단어/진행상황/설정의 단일 접근 계층.
 * - 클라우드 모드: Supabase에서 읽고 쓰며, 결과를 브라우저에 캐시한다.
 *   → 인터넷이 끊겨도(비행기 등) 캐시로 학습 가능.
 * - 로컬 모드: 내장 단어 + 브라우저 저장.
 */

export const DEFAULT_SIZE = 15;

const WORDS_CACHE = "cache.words.v1";
const progKey = (uid: string) => `cache.progress.${uid}`;
const setKey = (uid: string) => `cache.settings.${uid}`;

export interface SessionData {
  words: Word[];
  progress: ProgressMap;
  band: Band | null;
  size: number;
}

// ── DB 행 ↔ 앱 타입 변환 ──
interface WordRow {
  id: string;
  kanji: string;
  kana: string;
  meaning: string;
  level: Word["level"];
  pos: WordType["kind"];
  verb_group: number | null;
  hanja: Word["hanja"];
  examples: Word["examples"];
}

function rowToWord(r: WordRow): Word {
  const type: WordType =
    r.pos === "verb"
      ? { kind: "verb", group: (r.verb_group ?? 1) as 1 | 2 | 3 }
      : { kind: r.pos };
  return {
    id: r.id,
    kanji: r.kanji,
    kana: r.kana,
    meaning: r.meaning,
    level: r.level,
    type,
    hanja: r.hanja ?? [],
    examples: r.examples ?? [],
  };
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** 서버/로컬 진행상황을 최근 학습시각 기준으로 병합 (오프라인 편집 보존) */
function mergeProgress(server: ProgressMap, local: ProgressMap): ProgressMap {
  const out: ProgressMap = { ...server };
  for (const id of Object.keys(local)) {
    const l = local[id];
    const s = out[id];
    if (!s || (l && l.lastSeen >= s.lastSeen)) out[id] = l;
  }
  return out;
}

function entryRow(userId: string, wordId: string, p: Progress) {
  return {
    user_id: userId,
    word_id: wordId,
    mastery: p.mastery,
    seen_count: p.seenCount,
    last_seen: p.lastSeen ? new Date(p.lastSeen).toISOString() : null,
  };
}

// ── 로드 ──
export async function loadSession(userId: string | null): Promise<SessionData> {
  if (CLOUD && supabase && userId) {
    try {
      const [wordsRes, progRes, setRes] = await Promise.all([
        supabase.from("words").select("*"),
        supabase.from("progress").select("*").eq("user_id", userId),
        supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle(),
      ]);
      if (wordsRes.error || progRes.error) throw wordsRes.error ?? progRes.error;

      const words = (wordsRes.data ?? []).map((r) => rowToWord(r as WordRow));
      const serverProg: ProgressMap = {};
      for (const row of progRes.data ?? []) {
        serverProg[row.word_id] = {
          mastery: row.mastery,
          seenCount: row.seen_count,
          lastSeen: row.last_seen ? Date.parse(row.last_seen) : 0,
        };
      }

      // 오프라인 중 쌓인 로컬 변경과 병합 후, 더 최신인 항목은 서버로 반영
      const localProg = readJSON<ProgressMap>(progKey(userId), {});
      const progress = mergeProgress(serverProg, localProg);
      const newer = Object.keys(progress).filter(
        (id) => (localProg[id]?.lastSeen ?? 0) > (serverProg[id]?.lastSeen ?? -1)
      );
      if (newer.length) {
        void supabase
          .from("progress")
          .upsert(newer.map((id) => entryRow(userId, id, progress[id])), {
            onConflict: "user_id,word_id",
          });
      }

      // 캐시 저장 (오프라인 폴백용)
      if (words.length) localStorage.setItem(WORDS_CACHE, JSON.stringify(words));
      localStorage.setItem(progKey(userId), JSON.stringify(progress));
      const settings = setRes.data;
      if (settings) localStorage.setItem(setKey(userId), JSON.stringify(settings));

      return {
        words: words.length ? words : LOCAL_WORDS,
        progress,
        band: (settings?.band as Band) ?? null,
        size: settings?.worksheet_size ?? DEFAULT_SIZE,
      };
    } catch {
      // 오프라인/네트워크 실패 → 캐시로 학습
      const words = readJSON<Word[] | null>(WORDS_CACHE, null);
      const progress = readJSON<ProgressMap>(progKey(userId), {});
      const settings = readJSON<{ band?: Band; worksheet_size?: number } | null>(
        setKey(userId),
        null
      );
      return {
        words: words?.length ? words : LOCAL_WORDS,
        progress,
        band: settings?.band ?? null,
        size: settings?.worksheet_size ?? DEFAULT_SIZE,
      };
    }
  }

  // 로컬 모드
  return {
    words: LOCAL_WORDS,
    progress: loadProgress(),
    band: loadBand(),
    size: DEFAULT_SIZE,
  };
}

// ── 진행상황 저장 ──
export function persistProgress(
  userId: string | null,
  fullMap: ProgressMap,
  changedIds: string[]
): void {
  if (CLOUD && supabase && userId) {
    // 로컬 미러(오프라인에서도 즉시 반영/보존)
    localStorage.setItem(progKey(userId), JSON.stringify(fullMap));
    const rows = changedIds.map((id) => entryRow(userId, id, fullMap[id]));
    void supabase.from("progress").upsert(rows, { onConflict: "user_id,word_id" });
  } else {
    saveProgress(fullMap);
  }
}

// ── 설정 저장 ──
export function persistSettings(
  userId: string | null,
  band: Band,
  size: number
): void {
  if (CLOUD && supabase && userId) {
    localStorage.setItem(
      setKey(userId),
      JSON.stringify({ band, worksheet_size: size })
    );
    void supabase.from("user_settings").upsert(
      { user_id: userId, band, worksheet_size: size, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  } else {
    saveBand(band);
  }
}
