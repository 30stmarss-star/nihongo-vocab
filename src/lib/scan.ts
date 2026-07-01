import type { Level, Word, WordType } from "../data/types";
import { rowToWord } from "./store";
import { CLOUD, supabase } from "./supabase";

/**
 * 카메라 스캔 기능의 클라이언트 헬퍼.
 *  - 사진을 캔버스로 축소·JPEG로 재인코딩(전송량↓, Anthropic 권장 최대변 ~1568px)
 *  - scan-words Edge Function 호출: extract(인식) / save(편입)
 */

/** 검토 화면에서 편집하는 후보 단어 (Edge Function의 추출 스키마와 동일 구조) */
export interface ScanCandidate {
  kanji: string;
  kana: string;
  meaning: string;
  pos: WordType["kind"];
  verbGroup: number | null;
  hanja: { char: string; reading: string }[];
  examples: { jp: string; kana: string; ko: string }[];
  level: Level;
  freq: number;
}

export interface ScanImage {
  mediaType: string;
  data: string; // base64 (data URL 접두사 제외)
}

const MAX_EDGE = 1568;

/** File → 축소된 base64 JPEG. 큰 사진도 안전하게 전송된다. */
export function fileToScanImage(file: File): Promise<ScanImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("캔버스를 만들 수 없습니다"));
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      const comma = dataUrl.indexOf(",");
      resolve({ mediaType: "image/jpeg", data: dataUrl.slice(comma + 1) });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지를 읽을 수 없습니다"));
    };
    img.src = url;
  });
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  if (!(CLOUD && supabase)) throw new Error("클라우드 모드에서만 사용할 수 있어요.");
  const { data, error } = await supabase.functions.invoke("scan-words", { body });
  if (error) {
    // Edge Function이 4xx/5xx면 본문의 error 메시지를 최대한 살려서 던진다.
    let msg = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        const j = await ctx.json();
        if (j?.error) msg = j.error;
      }
    } catch {
      /* noop */
    }
    throw new Error(msg);
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

/** 사진 인식 → 후보 단어 목록 (저장 안 함) */
export async function extractWords(images: ScanImage[]): Promise<ScanCandidate[]> {
  const { words } = await invoke<{ words: ScanCandidate[] }>({ action: "extract", images });
  return words ?? [];
}

/** 검토·수정본 저장 → 편입된 Word 목록 (단어 풀 + 우선순위 큐에 반영됨) */
export async function saveWords(cands: ScanCandidate[]): Promise<Word[]> {
  const { saved } = await invoke<{ saved: Parameters<typeof rowToWord>[0][] }>({
    action: "save",
    words: cands,
  });
  return (saved ?? []).map(rowToWord);
}
