import {
  fileToMangaImage,
  isSupportedImage,
  readManga,
  regroupManga,
  saveMangaVocab,
  type MangaReadResult,
  type MangaSavedRow,
  type MangaVocab,
} from "./manga";

/**
 * 판독 세션 — **화면 밖에 산다.**
 *
 * 판독은 10초 안팎이 걸린다. 그 사이 단어장을 보러 갔다 오면 컴포넌트가 언마운트되면서
 * 진행 중인 판독이 통째로 날아가던 문제가 있었다. 그래서 상태를 컴포넌트가 아니라
 * 이 모듈이 들고 있는다. 화면은 여기를 구독해서 그리기만 한다.
 *
 * 이미지는 여전히 메모리에만 있다(objectURL). 여기서 수명을 관리해 새 페이지를 넣을 때
 * 앞 것을 회수한다.
 */

export type MangaStage = "pick" | "reading" | "done";

export interface MangaState {
  stage: MangaStage;
  title: string;
  preview: string | null;
  result: MangaReadResult | null;
  err: string | null;
  /** 담긴 표제어 / 담는 중인 표제어 */
  kept: ReadonlySet<string>;
  keeping: ReadonlySet<string>;
}

let state: MangaState = {
  stage: "pick",
  title: "",
  preview: null,
  result: null,
  err: null,
  kept: new Set(),
  keeping: new Set(),
};

let readId = crypto.randomUUID();
/** 담은 게 있는데 아직 묶음 이름을 안 붙였다 */
let needsRegroup = false;
/** 판독이 겹치지 않게 — 늦게 온 응답이 새 판독을 덮어쓰는 것도 막는다 */
let readToken = 0;

const listeners = new Set<() => void>();

function set(patch: Partial<MangaState>) {
  state = { ...state, ...patch };
  for (const fn of listeners) fn();
}

export function subscribeManga(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** useSyncExternalStore 용 — 바뀔 때만 새 객체를 준다 */
export function getMangaState(): MangaState {
  return state;
}

export function setMangaTitle(title: string) {
  set({ title });
}

/**
 * 묶음 이름 붙이기. LLM 호출이라 담을 때마다가 아니라
 * 페이지를 마치거나 단어장을 열 때 한 번 부른다.
 */
export async function flushMangaGroups(): Promise<void> {
  if (!needsRegroup) return;
  needsRegroup = false;
  try {
    await regroupManga();
  } catch (e) {
    // 이름이 안 붙어도 순서 로그는 남아 있다 — 단어장에서 "방금 담은 것"으로 보인다
    console.warn("[manga] 묶음 실패:", e instanceof Error ? e.message : e);
  }
}

/** 페이지 한 장 판독. 화면을 떠나도 계속 돌아간다. */
export async function startMangaRead(file: File): Promise<void> {
  // 이미지가 아니면 조용히 무시한다 — 다른 걸 복사하다 잘못 눌리는 경우가 잦다.
  if (!isSupportedImage(file)) return;
  if (state.stage === "reading") return;

  void flushMangaGroups(); // 앞 페이지에서 담은 것들을 여기서 한 묶음으로 마무리
  const token = ++readToken;
  readId = crypto.randomUUID();

  if (state.preview) URL.revokeObjectURL(state.preview);
  set({
    stage: "reading",
    preview: URL.createObjectURL(file),
    result: null,
    err: null,
    kept: new Set(),
    keeping: new Set(),
  });

  try {
    const image = await fileToMangaImage(file);
    const result = await readManga(image, state.title);
    if (token !== readToken) return; // 그 사이 새 페이지를 넣었다
    set({ stage: "done", result });
  } catch (e) {
    if (token !== readToken) return;
    set({
      stage: "pick",
      err: e instanceof Error ? e.message : "판독 중 오류가 났어요.",
    });
  }
}

/**
 * 고른 어휘만 담는다. 기본값은 담지 않음 —
 * 페이지를 넣었다고 단어장에 자동으로 들어가지 않는다.
 */
export async function keepMangaVocab(
  list: MangaVocab[],
  onSaved: (rows: MangaSavedRow[]) => void
): Promise<void> {
  const result = state.result;
  if (!result) return;

  const todo = list.filter((v) => !state.kept.has(v.word) && !state.keeping.has(v.word));
  if (!todo.length) return;
  const words = todo.map((v) => v.word);

  set({ keeping: new Set([...state.keeping, ...words]), err: null });
  try {
    const items = todo.map((v) => {
      const l = v.line_index >= 0 ? result.lines[v.line_index] : undefined;
      return { ...v, line_jp: l?.jp ?? "", line_kana: l?.kana ?? "", line_ko: l?.ko ?? "" };
    });
    const rows = await saveMangaVocab(readId, state.title, result.gist, items);
    onSaved(rows);
    needsRegroup = true;
    set({ kept: new Set([...state.kept, ...words]) });
  } catch (e) {
    set({ err: e instanceof Error ? e.message : "담는 중 오류가 났어요." });
  } finally {
    const rest = new Set(state.keeping);
    for (const w of words) rest.delete(w);
    set({ keeping: rest });
  }
}

/** 판독 세션을 비운다 (로그아웃 등) */
export function resetMangaSession() {
  readToken++;
  if (state.preview) URL.revokeObjectURL(state.preview);
  state = {
    stage: "pick",
    title: "",
    preview: null,
    result: null,
    err: null,
    kept: new Set(),
    keeping: new Set(),
  };
  for (const fn of listeners) fn();
}
