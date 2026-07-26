import type { Band, Word } from "../data/types";
import { isDue, isKnown, isRetired, overdueRatio, type ProgressMap } from "./srs";
import { CLOUD, supabase } from "./supabase";

/**
 * 하루 코스 엔진.
 *
 * "하루치" = 사이클 하나: ① 오늘의 단어(새 단어 + 복습 만기분, 카드 한 장씩)
 * ② 작문 스피킹(상황 롤플레이) ③ 데일리 시험(90% + 오답 즉시 재출제) 통과.
 * 시험까지 통과해야 사이클이 끝나고, 그날이 '달성일'로 기록된다(스트릭·잔디).
 *
 * 사이클은 날짜가 아니라 완료 기준으로 이어진다 — 하루에 다 못 하면 다음 날
 * 이어서 하고, 통과한 날 새 사이클을 또 시작할 수도 있다.
 */

// ── 날짜 (한국 시간 기준) ──

/** KST 기준 날짜 키 "2026-07-26" */
export function dayKey(now: number = Date.now()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** 날짜 키에 일수를 더한 키 (잔디/스트릭 계산용) */
export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d + days);
  const dt = new Date(t);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

// ── 코스 구성 ──

export const NEW_PER_DAY = 20; // 하루 새 단어
export const REVIEW_CAP = 20; // 하루 복습 상한(만기분 중 오래 밀린 순)
/**
 * 복습 칸 중 '어려움(아직 못 외운)' 단어가 차지할 수 있는 최대 비율.
 * 상한이 없으면 유독 안 외워지는 몇 개가 매일 복습을 독차지하고,
 * 익어가던 단어들은 복습 시점을 놓쳐 같이 무너진다(leech 문제).
 */
const HARD_SHARE = 0.6;
/** 이만큼 반복해서 틀리면 '집중 단어' — 접근을 바꿔야 한다는 신호 */
export const LEECH_SEEN = 8;

export interface Scenario {
  id: string;
  emoji: string;
  title: string;
  desc: string; // 모델에게 줄 상황 설명
}

export const SCENARIOS: Scenario[] = [
  { id: "conbini", emoji: "🏪", title: "편의점", desc: "편의점에서 물건 계산, 봉투 필요 여부, 도시락 데우기, 포인트 카드 등을 주고받는 상황" },
  { id: "restaurant", emoji: "🍜", title: "식당", desc: "식당에서 자리 안내, 주문, 추천 메뉴 묻기, 계산까지 이어지는 상황" },
  { id: "clothes", emoji: "👕", title: "옷가게", desc: "옷가게에서 사이즈·색상 문의, 입어보기, 가격 흥정 없이 계산하는 상황" },
  { id: "cafe", emoji: "☕", title: "카페", desc: "카페에서 음료 주문, 사이즈·아이스/핫, 매장/포장 여부를 주고받는 상황" },
  { id: "directions", emoji: "🗺️", title: "길 묻기", desc: "길에서 역·관광지 가는 법을 묻고 안내받는 상황" },
  { id: "station", emoji: "🚉", title: "전철역", desc: "전철역에서 표 구매, 환승, 몇 번 승강장인지 묻는 상황" },
  { id: "hotel", emoji: "🏨", title: "호텔", desc: "호텔 체크인/체크아웃, 조식 시간, 짐 보관을 부탁하는 상황" },
  { id: "pharmacy", emoji: "💊", title: "약국", desc: "약국에서 증상을 설명하고 약을 추천받아 복용법을 확인하는 상황" },
  { id: "izakaya", emoji: "🍶", title: "이자카야", desc: "이자카야에서 자리, 추천 안주, 술 주문, 추가 주문을 주고받는 상황" },
  { id: "airport", emoji: "✈️", title: "공항", desc: "공항 카운터에서 체크인, 수하물, 게이트 위치를 확인하는 상황" },
];

/** 작문 스피킹 총 소절 수: 4턴 × (내 대사 + 상대 대사) = 작문 8문장 */
export const SPEAK_STEPS = 8;

/** LLM이 만든 문장형 문항 (문맥 규정 / 유의 표현 / 용법) */
export interface ExamItem {
  kanji: string; // 어느 단어의 문항인지
  kind: "cloze" | "synonym" | "usage";
  sentence: string;
  ko: string;
  choices: string[];
  answerIndex: number;
}

/** 작문 스피킹 한 소절(내 대사 또는 상대 대사) */
export interface SpeakTurn {
  role: "me" | "partner";
  instruction: string;
  input?: string;
  eval?: {
    understood: string;
    verdict: "great" | "ok" | "retry";
    correctJp: string;
    correctKana: string;
    correctKo: string;
    feedback: string;
  };
}

export interface DailyPlan {
  day: string; // 사이클 시작일(KST)
  band: Band;
  newIds: string[];
  reviewIds: string[];
  scenarioId: string; // (구버전 호환용 — 지금은 아래 speakScenario를 쓴다)
  // 진행 상태
  learnIndex: number; // 카드 학습 진행 위치(이어하기)
  learnDone: boolean;
  speakStep: number; // 0~SPEAK_STEPS (작문 완료한 소절 수)
  speakScenario?: { emoji: string; title: string; desc: string }; // Claude가 창작한 오늘의 상황
  speakIntro?: string; // 상황 도입 문구(이어하기용)
  speakTurns?: SpeakTurn[]; // 진행된 대화(이어하기용)
  speakLogId?: string; // 이 코스의 작문 기록 id (서버 저장용)
  speakDone: boolean;
  speakSkipped?: boolean; // 오프라인 등으로 건너뜀
  examItems?: ExamItem[]; // 백그라운드로 미리 만들어 둔 문장형 문제
  testPassed: boolean;
  bestScore: number | null; // 시험 최고 점수(%)
  completedDay: string | null; // 시험 통과한 날(KST) — 달성일
  updatedAt?: number; // 마지막 저장 시각 — 기기 간 동기화에서 최신 쪽을 고르는 기준
}

/** 아직 손대지 않은 코스인가 (기기 간 병합에서 서버 것에 양보할지 판단) */
export function isPlanUntouched(p: DailyPlan): boolean {
  return (
    p.learnIndex === 0 &&
    !p.learnDone &&
    p.speakStep === 0 &&
    !p.speakDone &&
    !p.speakSkipped &&
    !p.testPassed
  );
}

/** 새 사이클 구성: 새 단어 NEW_PER_DAY + 복습 만기분(오래 밀린 순) REVIEW_CAP */
export function buildDailyPlan(
  pool: Word[],
  progress: ProgressMap,
  band: Band,
  now: number = Date.now()
): DailyPlan {
  const day = dayKey(now);

  // 복습: 만기된 것 중 많이 밀린 순 + 중요도(freq 1 우선) 보정
  const weight = (w: Word) => overdueRatio(progress[w.id]!, now) * (2 - ((w.freq ?? 2) - 1) * 0.3);
  const dueAll = pool.filter((w) => isDue(progress[w.id], now)).sort((a, b) => weight(b) - weight(a));

  // 어려움은 상한까지만 — 나머지 칸은 익어가는 단어에 양보한다
  const hardCap = Math.round(REVIEW_CAP * HARD_SHARE);
  const hard: Word[] = [];
  const rest: Word[] = [];
  for (const w of dueAll) (isKnown(progress[w.id]) ? rest : hard).push(w);
  const due = [...hard.slice(0, hardCap), ...rest].slice(0, REVIEW_CAP);
  // 상한 때문에 칸이 남으면 밀린 어려움 단어로 채운다
  if (due.length < REVIEW_CAP) {
    const used = new Set(due.map((w) => w.id));
    due.push(...hard.filter((w) => !used.has(w.id)).slice(0, REVIEW_CAP - due.length));
  }

  // 새 단어: 한 번도 안 본 것 중 중요도 우선 + 약간 섞기
  const fresh = pool.filter((w) => {
    const p = progress[w.id];
    return !p || p.seenCount === 0;
  });
  const jitter = new Map(fresh.map((w) => [w.id, Math.random()]));
  fresh.sort(
    (a, b) =>
      (a.freq ?? 2) - (b.freq ?? 2) ||
      (jitter.get(a.id) ?? 0) - (jitter.get(b.id) ?? 0)
  );
  const news = fresh.slice(0, NEW_PER_DAY);

  // 상황은 사이클마다 랜덤 — 코스가 끝날 때까지 유지된다.
  const scenario = SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)];

  return {
    day,
    band,
    newIds: news.map((w) => w.id),
    reviewIds: due.map((w) => w.id),
    scenarioId: scenario.id,
    learnIndex: 0,
    learnDone: false,
    speakStep: 0,
    speakDone: false,
    testPassed: false,
    bestScore: null,
    completedDay: null,
  };
}

export function scenarioOf(plan: DailyPlan): Scenario {
  return SCENARIOS.find((s) => s.id === plan.scenarioId) ?? SCENARIOS[0];
}

// ── 작문 대화 기록 (나중에 다시 읽어보기) ──

export interface SpeakLog {
  id: string;
  day: string;
  scenario: { emoji: string; title: string; desc: string } | null;
  intro: string;
  turns: SpeakTurn[];
  done: boolean;
  updatedAt: string;
}

/** 진행 중인 대화를 그때그때 서버에 올린다 (중간에 나가도 남게) */
export function saveSpeakLog(
  uid: string | null,
  log: Omit<SpeakLog, "updatedAt">
): void {
  if (!(CLOUD && supabase && uid) || !log.id) return;
  void supabase
    .from("speaking_log")
    .upsert(
      {
        id: log.id,
        user_id: uid,
        day: log.day,
        scenario: log.scenario,
        intro: log.intro,
        turns: log.turns,
        done: log.done,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    )
    .then(({ error }) => {
      if (error) console.warn("[speak] 기록 저장 실패:", error.message);
    });
}

/** 지난 작문 기록 목록 (최근순) */
export async function loadSpeakLogs(uid: string | null, limit = 50): Promise<SpeakLog[]> {
  if (!(CLOUD && supabase && uid)) return [];
  try {
    const { data, error } = await supabase
      .from("speaking_log")
      .select("*")
      .eq("user_id", uid)
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id,
      day: r.day,
      scenario: r.scenario ?? null,
      intro: r.intro ?? "",
      turns: Array.isArray(r.turns) ? r.turns : [],
      done: !!r.done,
      updatedAt: r.updated_at ?? "",
    }));
  } catch (e) {
    console.warn("[speak] 기록 불러오기 실패:", e instanceof Error ? e.message : e);
    return [];
  }
}

// ── 최근에 나온 작문 상황 (반복 방지용, 최근 20개 제목 보관) ──

const recentKey = (uid: string | null) => `speak.recent.${uid ?? "local"}`;

export function loadRecentScenarios(uid: string | null): string[] {
  try {
    const raw = localStorage.getItem(recentKey(uid));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/** 새 코스용 상황을 미리 창작해온다. 실패하면 null(스피킹 시작 때 다시 시도). */
export async function generateScenario(
  recent: string[],
  level: string
): Promise<{ emoji: string; title: string; desc: string } | null> {
  if (!(CLOUD && supabase)) return null;
  try {
    const { data, error } = await supabase.functions.invoke("speaking-roleplay", {
      body: { mode: "scenario", recent, level },
    });
    if (error) throw error;
    if (data?.error) throw new Error(String(data.error));
    const s = data?.scenario;
    return s?.title
      ? { emoji: s.emoji || "🎤", title: String(s.title), desc: String(s.desc ?? "") }
      : null;
  } catch (e) {
    console.warn("[speak] 상황 미리 생성 실패(시작 시 재시도):", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * 하루치 단어의 문장형 문항을 미리 만들어 온다 (코스 시작 시 백그라운드).
 * 실패하면 null — 시험은 규칙 기반 문항만으로도 성립한다.
 */
export async function generateExam(
  words: Array<{ kanji: string; kana: string; meaning: string; pos: string }>,
  level: string
): Promise<ExamItem[] | null> {
  if (!(CLOUD && supabase) || !words.length) return null;
  try {
    const { data, error } = await supabase.functions.invoke("generate-exam", {
      body: { level, words },
    });
    if (error) throw error;
    if (data?.error) throw new Error(String(data.error));
    const raw = Array.isArray(data?.items) ? data.items : [];
    const items: ExamItem[] = raw.filter(
      (it: ExamItem) =>
        it &&
        typeof it.kanji === "string" &&
        Array.isArray(it.choices) &&
        it.choices.length === 4 &&
        it.answerIndex >= 0 &&
        it.answerIndex < 4 &&
        ["cloze", "synonym", "usage"].includes(it.kind) &&
        // 문맥 규정은 빈칸이 실제로 있어야 문제가 된다
        (it.kind !== "cloze" || it.sentence.includes("＿"))
    );
    return items.length ? items : null;
  } catch (e) {
    console.warn("[exam] 문항 미리 생성 실패(규칙 문항으로 진행):", e instanceof Error ? e.message : e);
    return null;
  }
}

export function pushRecentScenario(uid: string | null, title: string): void {
  try {
    const list = loadRecentScenarios(uid).filter((t) => t !== title);
    list.push(title);
    localStorage.setItem(recentKey(uid), JSON.stringify(list.slice(-20)));
  } catch {
    /* noop */
  }
}

// ── 저장 (플랜: 로컬 / 달성 기록: 로컬 + 클라우드 병합) ──

// 플랜은 밴드별로 따로 보관한다 — 난이도를 바꿨다 돌아와도 하던 코스가 그대로 이어진다.
const planKey = (uid: string | null, band: Band) => `daily.plan.${uid ?? "local"}.${band}`;
const legacyPlanKey = (uid: string | null) => `daily.plan.${uid ?? "local"}`;
const actKey = (uid: string | null) => `daily.activity.${uid ?? "local"}`;

export function loadPlan(uid: string | null, band: Band): DailyPlan | null {
  try {
    const raw =
      localStorage.getItem(planKey(uid, band)) ?? localStorage.getItem(legacyPlanKey(uid));
    if (!raw) return null;
    const plan = JSON.parse(raw) as DailyPlan;
    return plan.band === band ? plan : null;
  } catch {
    return null;
  }
}

export function savePlan(uid: string | null, plan: DailyPlan): void {
  const stamped = { ...plan, updatedAt: Date.now() };
  try {
    localStorage.setItem(planKey(uid, plan.band), JSON.stringify(stamped));
  } catch {
    /* noop */
  }
  // 다른 기기에서도 이어서 하도록 서버에도 올린다 (테이블 없으면 조용히 로컬만)
  if (CLOUD && supabase && uid) {
    void supabase
      .from("daily_plan")
      .upsert(
        {
          user_id: uid,
          band: plan.band,
          plan: stamped,
          updated_at: new Date(stamped.updatedAt).toISOString(),
        },
        { onConflict: "user_id,band" }
      )
      .then(({ error }) => {
        if (error) console.warn("[plan] 서버 저장 실패(로컬은 저장됨):", error.message);
      });
  }
}

/**
 * 서버에 있는 코스 진행 상태를 가져와 로컬과 비교한다.
 * 서버 쪽이 더 최신이거나 로컬이 아직 손도 안 댄 코스면 서버 것을 쓴다.
 * 채택할 게 없으면 null.
 */
export async function syncPlan(
  uid: string | null,
  band: Band,
  local: DailyPlan | null
): Promise<DailyPlan | null> {
  if (!(CLOUD && supabase && uid)) return null;
  try {
    const { data, error } = await supabase
      .from("daily_plan")
      .select("plan")
      .eq("user_id", uid)
      .eq("band", band)
      .maybeSingle();
    if (error) throw error;
    const remote = data?.plan as DailyPlan | undefined;
    if (!remote?.day || remote.band !== band) return null;

    if (!local) return remote;
    // 로컬이 방금 만들어진 빈 코스면 서버에서 하던 걸 이어받는다
    if (isPlanUntouched(local) && !isPlanUntouched(remote)) return remote;
    if ((remote.updatedAt ?? 0) > (local.updatedAt ?? 0)) return remote;
    return null;
  } catch (e) {
    console.warn("[plan] 서버 동기화 생략:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** 접속일/달성일 기록. done[day] = 그날 시험 점수(%) */
export interface ActivityLog {
  access: Record<string, 1>;
  done: Record<string, number>;
}

export function loadActivity(uid: string | null): ActivityLog {
  try {
    const raw = localStorage.getItem(actKey(uid));
    const a = raw ? (JSON.parse(raw) as ActivityLog) : null;
    return { access: a?.access ?? {}, done: a?.done ?? {} };
  } catch {
    return { access: {}, done: {} };
  }
}

function saveActivityLocal(uid: string | null, a: ActivityLog): void {
  try {
    localStorage.setItem(actKey(uid), JSON.stringify(a));
  } catch {
    /* noop */
  }
}

/** 오늘 접속 기록 (스트릭과 무관, 잔디 연한 색용) */
export function recordAccess(uid: string | null): ActivityLog {
  const a = loadActivity(uid);
  const today = dayKey();
  if (!a.access[today]) {
    a.access[today] = 1;
    saveActivityLocal(uid, a);
  }
  return a;
}

/** 달성일 기록 (+클라우드 upsert, 테이블 없으면 조용히 로컬만) */
export function recordDone(uid: string | null, day: string, score: number): ActivityLog {
  const a = loadActivity(uid);
  if (!(day in a.done) || a.done[day] < score) a.done[day] = score;
  saveActivityLocal(uid, a);
  if (CLOUD && supabase && uid) {
    void supabase
      .from("daily_activity")
      .upsert(
        { user_id: uid, day, score, updated_at: new Date().toISOString() },
        { onConflict: "user_id,day" }
      )
      .then(({ error }) => {
        if (error) console.warn("[daily] 클라우드 저장 실패(로컬은 저장됨):", error.message);
      });
  }
  return a;
}

/** 클라우드 달성 기록을 로컬과 병합 (여러 기기 스트릭 유지). 테이블 없으면 로컬만. */
export async function syncActivity(uid: string | null): Promise<ActivityLog> {
  const local = loadActivity(uid);
  if (!(CLOUD && supabase && uid)) return local;
  try {
    const { data, error } = await supabase
      .from("daily_activity")
      .select("day, score")
      .eq("user_id", uid);
    if (error) throw error;
    let changed = false;
    const server = new Set<string>();
    for (const row of data ?? []) {
      server.add(row.day);
      const s = typeof row.score === "number" ? row.score : 100;
      if (!(row.day in local.done) || local.done[row.day] < s) {
        local.done[row.day] = s;
        changed = true;
      }
    }
    // 로컬에만 있는 달성일은 서버로 올린다
    const missing = Object.keys(local.done).filter((d) => !server.has(d));
    if (missing.length) {
      void supabase.from("daily_activity").upsert(
        missing.map((d) => ({
          user_id: uid,
          day: d,
          score: local.done[d],
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "user_id,day" }
      );
    }
    if (changed) saveActivityLocal(uid, local);
  } catch (e) {
    console.warn("[daily] 클라우드 동기화 생략:", e instanceof Error ? e.message : e);
  }
  return local;
}

// ── 스트릭/통계 ──

/** 연속 달성 일수. 오늘 아직 안 했으면 어제까지의 연속으로 계산. */
export function streakOf(a: ActivityLog, today: string = dayKey()): number {
  let d = a.done[today] != null ? today : addDays(today, -1);
  let n = 0;
  while (a.done[d] != null) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

/** 잔디용: 최근 weeks주(오늘 포함, 일요일 시작) 날짜 격자 */
export function grassGrid(weeks: number, today: string = dayKey()): string[][] {
  const [y, m, d] = today.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=일
  const end = addDays(today, 6 - dow); // 이번 주 토요일
  const grid: string[][] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const col: string[] = [];
    for (let i = 0; i < 7; i++) col.push(addDays(end, -(w * 7) - (6 - i)));
    grid.push(col);
  }
  return grid;
}

/**
 * '집중 단어': 여러 번 만났는데도 여전히 못 외운 단어.
 * 그냥 반복해선 안 뚫리니 접근을 바꾸라고(한자 어원 보기 등) 알려준다.
 */
export function leechWords(pool: Word[], progress: ProgressMap): Word[] {
  return pool
    .filter((w) => {
      const p = progress[w.id];
      return !!p && !isKnown(p) && !isRetired(p) && p.seenCount >= LEECH_SEEN;
    })
    .sort((a, b) => (progress[b.id]?.seenCount ?? 0) - (progress[a.id]?.seenCount ?? 0));
}

/** JLPT 정복률: 현재 밴드 풀에서 외운(체크 이상) 비율 */
export function masteryStats(pool: Word[], progress: ProgressMap) {
  let known = 0;
  let retired = 0;
  for (const w of pool) {
    const p = progress[w.id];
    if (isRetired(p)) retired++;
    else if (isKnown(p)) known++;
  }
  return { total: pool.length, known, retired, pct: pool.length ? Math.round(((known + retired) / pool.length) * 100) : 0 };
}
