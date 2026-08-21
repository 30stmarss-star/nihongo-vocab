import type { Level, WordType } from "../data/types";
import { CLOUD, supabase } from "./supabase";

/**
 * 만화 판독의 클라이언트 헬퍼.
 *
 * 이미지는 **가능하면 손대지 않고 그대로 보낸다.** 만화는 후리가나가 작아서
 * 해상도와 재인코딩이 판독 정확도를 그대로 깎는다. Anthropic 문서도
 * "lossy 재압축은 글자를 읽기 어렵게 만든다"고 경고한다.
 *
 * 그래서 이 파일이 하는 일은 화질 개선이 아니라 **요청이 거부되는 경계를 피하는 것**뿐이다.
 *  - 긴 변 2576px 이하면 서버가 아무것도 안 하므로 원본 바이트를 그대로 보낸다(PNG면 PNG로).
 *  - 그보다 크면 어차피 서버가 줄이므로, 우리가 미리 줄여 전송량·지연을 아낀다.
 *  - base64 10MB / 8000px 를 넘으면 API가 거부한다 — 그 앞에서 반드시 줄인다.
 *
 * 원본 이미지는 어디에도 저장하지 않는다. 메모리에서만 다룬다.
 */

/** Opus 5(고해상도 티어)가 원본 그대로 보는 상한. 넘으면 서버가 여기까지 축소한다. */
const MAX_EDGE = 2576;
/** API가 아예 거부하는 픽셀 상한 */
const HARD_EDGE = 8000;
/** API의 장당 base64 상한은 10MB. 요청 봉투 여유를 두고 7MB에서 자른다. */
const MAX_B64_BYTES = 7_000_000;

const SUPPORTED = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export interface MangaImage {
  mediaType: string;
  data: string; // base64 (data URL 접두사 제외)
}

export interface MangaLine {
  jp: string;
  kana: string;
  ko: string;
  note: string; // 뉘앙스·생략·말투 등 참고사항. 없으면 빈 문자열
}

export interface MangaGrammar {
  point: string; // 문법 형태 그대로 (〜てる 등)
  ko: string;
  line_index: number;
}

export interface MangaVocab {
  word: string;
  surface: string;
  reading: string;
  ko: string;
  level: Level;
  pos: WordType["kind"];
  verbGroup: number | null;
  freq: number;
  hanja: { char: string; reading: string }[];
  parts: string;
  line_index: number; // lines 인덱스. -1 이면 대사에서 나온 게 아님
}

export interface MangaKanji {
  char: string;
  on: string;
  kun: string;
  ko: string;
  radical: string;
  hint: string;
  line_index: number;
}

export interface MangaSfx {
  jp: string;
  ko: string;
}

export interface MangaReadResult {
  gist: string;
  lines: MangaLine[];
  vocab: MangaVocab[];
  grammar: MangaGrammar[];
  kanji: MangaKanji[];
  sfx: MangaSfx[];
}

/** 이미지 파일인가? (클립보드에 다른 게 들어있는 건 조용히 무시하기 위한 판별) */
export function isSupportedImage(file: File | null | undefined): boolean {
  return Boolean(file && SUPPORTED.includes(file.type));
}

/** 원본 바이트 → base64 (재인코딩 없음) */
function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const url = String(fr.result);
      const comma = url.indexOf(",");
      resolve(comma >= 0 ? url.slice(comma + 1) : "");
    };
    fr.onerror = () => reject(new Error("이미지를 읽을 수 없습니다"));
    fr.readAsDataURL(file);
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지를 읽을 수 없습니다"));
    };
    img.src = url;
  });
}

/** base64 로 부풀었을 때의 대략 크기 (3바이트 → 4문자) */
const b64Size = (bytes: number) => Math.ceil(bytes / 3) * 4;

/**
 * File → 전송할 이미지.
 * 대부분의 스크린샷은 여기서 **아무 변형 없이** 통과한다.
 */
export async function fileToMangaImage(file: File): Promise<MangaImage> {
  if (!isSupportedImage(file)) throw new Error("이미지 파일이 아닙니다.");

  const img = await loadImage(file);
  const longEdge = Math.max(img.width, img.height);
  const fitsRaw = longEdge <= MAX_EDGE && b64Size(file.size) <= MAX_B64_BYTES;

  // ① 통과 경로 — 원본 그대로. 무손실이라 후리가나가 안 뭉개진다.
  if (fitsRaw) {
    return { mediaType: file.type, data: await readAsBase64(file) };
  }

  // ② 축소 경로 — 서버가 어차피 줄일 크기까지만 우리가 줄인다.
  const cap = Math.min(MAX_EDGE, HARD_EDGE);
  const scale = Math.min(1, cap / longEdge);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("캔버스를 만들 수 없습니다");
  // 만화는 선이 가늘다 — 축소할 때 보간 품질을 최대로.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);

  // 글자가 뭉개지지 않는 선에서 시작해, 용량 상한에 걸리면 한 단계씩 낮춘다.
  for (const q of [0.92, 0.85, 0.78]) {
    const dataUrl = canvas.toDataURL("image/jpeg", q);
    const data = dataUrl.slice(dataUrl.indexOf(",") + 1);
    if (data.length <= MAX_B64_BYTES) return { mediaType: "image/jpeg", data };
  }
  throw new Error("이미지가 너무 큽니다. 페이지 일부만 잘라서 다시 시도해 주세요.");
}

/** 만화에서 담은 단어의 묶음 (manga_log 의 구간을 가리킨다) */
export interface MangaGroup {
  id: string;
  name: string;
  subtitle: string | null;
  kind: "scene" | "flow" | "theme" | "day";
  from_id: number;
  to_id: number;
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  if (!(CLOUD && supabase)) throw new Error("클라우드 모드에서만 사용할 수 있어요.");
  const { data, error } = await supabase.functions.invoke("read-manga", { body });
  if (error) {
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

/** 페이지 판독 */
export async function readManga(image: MangaImage, title?: string): Promise<MangaReadResult> {
  const data = await call<{ read?: Partial<MangaReadResult> }>({
    action: "read",
    image,
    title: title ?? "",
  });

  const read = data?.read;
  if (!read) throw new Error("판독 결과가 비어 있어요. 다시 시도해 주세요.");

  // 배포 시차로 옛 함수가 응답할 수 있다(필드가 통째로 없음). 빈 배열로 메워 화면이 죽지 않게.
  const arr = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);
  return {
    gist: typeof read.gist === "string" ? read.gist : "",
    lines: arr<MangaLine>(read.lines).map((l) => ({ ...l, note: l.note ?? "" })),
    vocab: arr<MangaVocab>(read.vocab),
    grammar: arr<MangaGrammar>(read.grammar),
    kanji: arr<MangaKanji>(read.kanji).map((k) => ({ ...k, line_index: k.line_index ?? -1 })),
    sfx: arr<MangaSfx>(read.sfx),
  };
}

/** 저장 요청 한 건 — 어휘 + 그 단어를 만난 대사 */
export interface MangaSaveItem extends MangaVocab {
  line_jp: string;
  line_kana: string;
  line_ko: string;
}

/** DB 행 (store.rowToWord 로 앱 타입으로 바꾼다) */
export interface MangaSavedRow {
  id: string;
  kanji: string;
  kana: string;
  meaning: string;
  level: Level;
  pos: WordType["kind"];
  verb_group: number | null;
  hanja: { char: string; reading: string }[];
  examples: { jp: string; kana: string; ko: string }[];
  freq: number | null;
}

/**
 * 고른 어휘만 단어장에 담는다. 서버가 순서 로그(manga_log)에도 같이 쌓는다.
 * 레벨은 기존 어휘 데이터가 이긴다 — 같은 단어가 두 레벨로 갈라지는 걸 막는다.
 */
export async function saveMangaVocab(
  readId: string,
  title: string,
  gist: string,
  items: MangaSaveItem[]
): Promise<MangaSavedRow[]> {
  const { saved } = await call<{ saved: MangaSavedRow[] }>({
    action: "save",
    readId,
    title,
    gist,
    items,
  });
  return saved ?? [];
}

/**
 * 아직 이름이 없는 구간에 이름을 붙인다. 이미 붙은 묶음은 건드리지 않는다.
 * 담을 때마다 부르지 말고 페이지를 한 번 마칠 때 부르는 게 맞다(호출 비용).
 */
export async function regroupManga(): Promise<MangaGroup[]> {
  const { groups } = await call<{ groups: MangaGroup[] }>({ action: "regroup" });
  return groups ?? [];
}

/** 단어장에서 쓸 만화 묶음 + 공부한 순서 */
export interface MangaBook {
  groups: MangaGroup[];
  /** word_id → manga_log.id. 이 값이 "내가 공부한 순서"이자 묶음 구간의 좌표다. */
  order: Map<string, number>;
}

const EMPTY_BOOK: MangaBook = { groups: [], order: new Map() };

/**
 * 로그와 묶음을 함께 읽어온다.
 * 로그가 진실이므로 묶음이 아직 없어도 순서는 살아 있다 — 그 경우 "아직 안 엮인" 칸에 모인다.
 */
export async function loadMangaBook(userId: string | null): Promise<MangaBook> {
  if (!(CLOUD && supabase && userId)) return EMPTY_BOOK;
  try {
    const [log, groups] = await Promise.all([
      supabase.from("manga_log").select("id,word_id").order("id", { ascending: true }),
      supabase
        .from("manga_group")
        .select("id,name,subtitle,kind,from_id,to_id")
        .order("from_id", { ascending: true }),
    ]);
    if (log.error || groups.error) throw log.error ?? groups.error;
    return {
      groups: (groups.data ?? []) as MangaGroup[],
      order: new Map((log.data ?? []).map((r) => [r.word_id as string, r.id as number])),
    };
  } catch (e) {
    // 테이블이 아직 없거나 네트워크가 죽어도 단어장 자체는 떠야 한다
    console.warn("[manga] 묶음 불러오기 실패:", e instanceof Error ? e.message : e);
    return EMPTY_BOOK;
  }
}
