import { WORDS as LOCAL_WORDS } from "../data/words";
import type { Band, Word, WordType } from "../data/types";
import type { Progress, ProgressMap } from "./srs";
import { loadBand, loadProgress, saveBand, saveProgress } from "./storage";
import { CLOUD, supabase } from "./supabase";

/**
 * 단어/진행상황/설정의 단일 접근 계층.
 * - 클라우드 모드(Supabase 설정됨): DB에서 읽고 쓴다 (여러 기기 동기화).
 * - 로컬 모드: 내장 단어 + 브라우저 저장(localStorage).
 */

export const DEFAULT_SIZE = 15;

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

// ── 로드 ──
export async function loadSession(userId: string | null): Promise<SessionData> {
  if (CLOUD && supabase && userId) {
    const [wordsRes, progRes, setRes] = await Promise.all([
      supabase.from("words").select("*"),
      supabase.from("progress").select("*").eq("user_id", userId),
      supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle(),
    ]);

    const words = (wordsRes.data ?? []).map((r) => rowToWord(r as WordRow));
    const progress: ProgressMap = {};
    for (const row of progRes.data ?? []) {
      progress[row.word_id] = {
        mastery: row.mastery,
        seenCount: row.seen_count,
        lastSeen: row.last_seen ? Date.parse(row.last_seen) : 0,
      };
    }
    const settings = setRes.data;
    return {
      words: words.length ? words : LOCAL_WORDS, // DB가 비어 있으면 내장 단어로 폴백
      progress,
      band: (settings?.band as Band) ?? null,
      size: settings?.worksheet_size ?? DEFAULT_SIZE,
    };
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
    const rows = changedIds.map((id) => entryRow(userId, id, fullMap[id]));
    void supabase.from("progress").upsert(rows, { onConflict: "user_id,word_id" });
  } else {
    saveProgress(fullMap);
  }
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

// ── 설정 저장 ──
export function persistSettings(
  userId: string | null,
  band: Band,
  size: number
): void {
  if (CLOUD && supabase && userId) {
    void supabase.from("user_settings").upsert(
      { user_id: userId, band, worksheet_size: size, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  } else {
    saveBand(band);
  }
}
