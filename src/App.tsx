import { useEffect, useMemo, useRef, useState } from "react";
import { BANDS, typeLabel, type Band, type Word } from "./data/types";
import {
  defaultProgress,
  isKnown,
  isRetired,
  markKnown,
  markRetired,
  markUnknown,
  touch,
  type ProgressMap,
} from "./lib/srs";
import {
  addToWordbook,
  loadCachedSession,
  loadScannedQueue,
  loadSession,
  loadWordbookLocal,
  lookupWord,
  persistProgress,
  persistSettings,
  syncWordbook,
  type Wordbook,
} from "./lib/store";
import {
  buildDailyPlan,
  generateExam,
  generateScenario,
  loadPlan,
  loadRecentScenarios,
  masteryStats,
  pushRecentScenario,
  recordAccess,
  recordDone,
  savePlan,
  savePlanLocal,
  saveSpeakLog,
  SPEAK_STEPS,
  streakOf,
  syncActivity,
  syncPlan,
  dayKey,
  type ActivityLog,
  type DailyPlan,
} from "./lib/daily";
import { CLOUD, supabase } from "./lib/supabase";
import { WordTable } from "./components/WordTable";
import { WordCard } from "./components/WordCard";
import { Login } from "./components/Login";
import { Chat } from "./components/Chat";
import { ConfusableCards } from "./components/ConfusableCards";
import { ScanCapture } from "./components/ScanCapture";
import { Quiz, type QuizResult } from "./components/Quiz";
import { Reference } from "./components/Reference";
import { Home } from "./components/Home";
import { DailyLearn } from "./components/DailyLearn";
import { DailyTest } from "./components/DailyTest";
import { Speaking } from "./components/Speaking";
import { SpeakingLog } from "./components/SpeakingLog";
import { isTokenWord } from "./components/JpText";
import { BUILD_ID, forceUpdate } from "./lib/version";

type View =
  | "home"
  | "learn"
  | "relearn"
  | "speak"
  | "test"
  | "wordbook"
  | "speaklog"
  | "scan"
  | "kanji"
  | "tutor"
  | "quiz"
  | "reference";

type Phase = "loading" | "login" | "ready";

/** 코스 진행 화면(전체 화면 집중 모드) — 하단 네비를 숨긴다 */
const FOCUS_VIEWS: View[] = ["learn", "relearn", "speak", "test"];

/** 단어장 정렬 기준: 0=어려움(아직 못 외움) 1=쉬움 2=완전 암기 */
function difficultyRank(w: Word, progress: ProgressMap): 0 | 1 | 2 {
  const p = progress[w.id];
  return isRetired(p) ? 2 : isKnown(p) ? 1 : 0;
}

export default function App() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [userId, setUserId] = useState<string | null>(null);
  const loadedFor = useRef<string | null | undefined>(undefined);

  const [words, setWords] = useState<Word[]>([]);
  const [progress, setProgress] = useState<ProgressMap>({});
  const [band, setBand] = useState<Band | null>(null);
  const [view, setView] = useState<View>("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [activity, setActivity] = useState<ActivityLog>({ access: {}, done: {} });
  // 단어장 방향: false=일본어 보기(뜻 가림), true=뜻 보기(단어 가림)
  const [bookReverse, setBookReverse] = useState(false);
  const [scanned, setScanned] = useState<Set<string>>(new Set());
  // 단어장: 하루 코스를 마친 단어 + 촬영 단어 (id → 담은 날짜)
  const [wordbook, setWordbook] = useState<Wordbook>(new Map());
  const [card, setCard] = useState<{ word: Word; x: number; y: number } | null>(null);
  // 사전에 없는 단어의 카드를 만들어 저장하는 중
  const [savingCard, setSavingCard] = useState(false);

  // ── 인증 / 초기 로드 ──
  useEffect(() => {
    if (!CLOUD) {
      void init(null);
      return;
    }
    const { data: sub } = supabase!.auth.onAuthStateChange((_e, sess) => {
      const uid = sess?.user?.id ?? null;
      if (uid) {
        setUserId(uid);
        if (loadedFor.current !== uid) {
          loadedFor.current = uid;
          void init(uid);
        }
      } else {
        loadedFor.current = null;
        setUserId(null);
        setPhase("login");
      }
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function init(uid: string | null) {
    setActivity(recordAccess(uid));
    void syncActivity(uid).then(setActivity);
    setWordbook(loadWordbookLocal(uid));
    void syncWordbook(uid).then(setWordbook);

    // 1) 캐시가 있으면 네트워크를 기다리지 않고 즉시 화면을 띄운다.
    const cached = loadCachedSession(uid);
    if (cached && cached.words.length) {
      setWords(cached.words);
      setProgress(cached.progress);
      if (cached.band) {
        setBand(cached.band);
        setPlan(ensurePlan(uid, cached.band, cached.words, cached.progress));
      }
      setPhase("ready");
    } else {
      setPhase("loading");
    }

    // 2) 서버에서 최신 데이터를 받아 백그라운드로 반영한다.
    const [s, scannedSet] = await Promise.all([loadSession(uid), loadScannedQueue(uid)]);
    setWords(s.words);
    setScanned(scannedSet);
    setProgress(s.progress);
    if (s.band) {
      setBand(s.band);
      // 서버를 '먼저' 확인한다. 로컬에 코스를 만들어 올린 뒤에 확인하면
      // 다른 기기에서 하던 진행을 덮어쓴 걸 되읽게 된다.
      const remote = await syncPlan(uid, s.band, loadPlan(uid, s.band));
      if (remote) savePlanLocal(uid, remote);
      setPlan(ensurePlan(uid, s.band, s.words, s.progress));
    }
    setPhase("ready");
  }

  // 창을 다시 보게 될 때 서버와 맞춘다 — PC를 켜둔 채 폰으로 진행한 경우를 잡는다.
  // (코스 화면에 들어가 있는 동안은 방해하지 않는다)
  useEffect(() => {
    if (!(CLOUD && userId) || !band) return;
    function onFocus() {
      if (document.visibilityState !== "visible") return;
      if (FOCUS_VIEWS.includes(view)) return;
      void syncPlan(userId, band!, loadPlan(userId, band!)).then((merged) => {
        if (merged) {
          savePlanLocal(userId, merged);
          setPlan(merged);
        }
      });
    }
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [userId, band, view]);

  function poolFor(b: Band, list: Word[] = words): Word[] {
    const levels = BANDS.find((x) => x.id === b)!.levels;
    return list.filter((w) => levels.includes(w.level));
  }

  /**
   * 오늘의 플랜 확보: 없거나, 밴드가 바뀌었거나, 지난 사이클을 통과한 뒤
   * 날짜가 넘어갔으면 새로 만든다. (미완료 사이클은 날짜가 지나도 이어서)
   */
  function ensurePlan(uid: string | null, b: Band, list: Word[], prog: ProgressMap): DailyPlan {
    const existing = loadPlan(uid, b);
    const today = dayKey();
    const ids = new Set(list.map((w) => w.id));
    const valid =
      existing &&
      existing.band === b &&
      existing.newIds.concat(existing.reviewIds).some((id) => ids.has(id)) &&
      !(existing.testPassed && existing.day !== today);
    if (valid) return existing!;
    // 갓 만든 빈 코스는 서버에 올리지 않는다 — 다른 기기에서 하던 진행을 덮어쓰게 된다.
    // 서버 반영은 실제로 진행을 건드릴 때(updatePlan) 일어난다.
    const fresh = buildDailyPlan(poolFor(b, list), prog, b);
    savePlanLocal(uid, fresh);
    return fresh;
  }

  function updatePlan(patch: Partial<DailyPlan>) {
    setPlan((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      savePlan(userId, next);
      return next;
    });
  }

  function newCycle() {
    if (!band) return;
    const fresh = buildDailyPlan(poolFor(band), progress, band);
    savePlan(userId, fresh);
    setPlan(fresh);
  }

  function chooseBand(b: Band) {
    setBand(b);
    persistSettings(userId, b, 30);
    setPlan(ensurePlan(userId, b, words, progress));
  }

  /** 촬영 저장 완료: 단어 풀에 병합 (다음 사이클의 새 단어 후보로 들어간다) */
  function onScanSaved(saved: Word[]) {
    if (!saved.length) return;
    const byId = new Map(words.map((w) => [w.id, w]));
    for (const w of saved) byId.set(w.id, w);
    setWords([...byId.values()]);
    const nextScanned = new Set(scanned);
    for (const w of saved) nextScanned.add(w.id);
    setScanned(nextScanned);
    // 촬영한 단어는 단어장에도 바로 넣는다
    setWordbook((prev) => addToWordbook(userId, saved.map((w) => w.id), prev));
    setView("home");
  }

  function update(id: string, fn: typeof markKnown) {
    setProgress((prev) => {
      const np = fn(prev[id] ?? defaultProgress(), Date.now());
      const next = { ...prev, [id]: np };
      persistProgress(userId, next, [id]);
      return next;
    });
  }

  /** 카드 학습에서 단어가 화면에 나옴 → 도입 기록 */
  function onSeen(id: string) {
    setProgress((prev) => {
      const t = touch(prev[id], Date.now());
      if (t === prev[id]) return prev;
      const next = { ...prev, [id]: t };
      persistProgress(userId, next, [id]);
      return next;
    });
  }

  /** 시험 결과 일괄 반영: 맞힌 단어는 숙련도↑, 틀린 단어는 복습으로. */
  function applyQuizResults(results: QuizResult[]) {
    setProgress((prev) => {
      const now = Date.now();
      const next = { ...prev };
      const changed: string[] = [];
      for (const r of results) {
        const p = next[r.id] ?? defaultProgress();
        next[r.id] = r.correct ? markKnown(p, now) : markUnknown(p, now);
        changed.push(r.id);
      }
      if (changed.length) persistProgress(userId, next, changed);
      return next;
    });
  }

  function onTestPassed(score: number) {
    const today = dayKey();
    setActivity(recordDone(userId, today, score));
    updatePlan({ testPassed: true, bestScore: score, completedDay: today });
    // 하루 코스를 마친 단어는 전부 단어장에 들어간다
    if (plan) {
      setWordbook((prev) =>
        addToWordbook(userId, [...plan.newIds, ...plan.reviewIds], prev)
      );
    }
  }

  // ── 파생 데이터 ──
  const bandPool = useMemo(() => (band ? poolFor(band) : []), [band, words]); // eslint-disable-line react-hooks/exhaustive-deps

  const planWords = useMemo(() => {
    if (!plan) return { list: [] as Word[], newCount: 0 };
    const byId = new Map(words.map((w) => [w.id, w]));
    const news = plan.newIds.map((id) => byId.get(id)).filter(Boolean) as Word[];
    const revs = plan.reviewIds.map((id) => byId.get(id)).filter(Boolean) as Word[];
    return { list: [...news, ...revs], newCount: news.length };
  }, [plan, words]);

  const bookWords = useMemo(() => {
    // 단어장 = 하루 코스를 마친 단어 + 촬영 단어 + (예전 방식에서) 체크했던 단어.
    // 레벨(밴드)과 무관하게 전부 보여준다 — 내가 거쳐온 단어 모음이니까.
    const list = words.filter((w) => wordbook.has(w.id) || isKnown(progress[w.id]));
    // 어려움(아직 못 외움) → 쉬움 → 완전 암기 순. 같은 묶음 안에서는 최근 본 순.
    return list.sort(
      (a, b) =>
        difficultyRank(a, progress) - difficultyRank(b, progress) ||
        (progress[b.id]?.lastSeen ?? 0) - (progress[a.id]?.lastSeen ?? 0)
    );
  }, [words, progress, wordbook]);

  // 단어장 표시 목록은 '세션 스냅샷': 탭에 들어올 때만 재정렬하고,
  // 안에서 체크를 바꿔도 행이 제자리에 있게 한다(체크 풀자마자 튀지 않게).
  // 새로 추가된 단어만 뒤에 붙는다.
  const [bookDisplay, setBookDisplay] = useState<Word[]>([]);
  // 그룹 배정도 같이 얼려둔다 — 체크하자마자 다른 묶음으로 튀지 않게.
  // (행의 색은 실시간으로 바뀌어서 방금 체크한 게 보인다)
  const [bookRanks, setBookRanks] = useState<Map<string, 0 | 1 | 2>>(new Map());
  const prevViewRef = useRef<View>(view);
  useEffect(() => {
    const wasBook = prevViewRef.current === "wordbook";
    prevViewRef.current = view;
    if (view !== "wordbook") return;

    const rankOf = (list: Word[], base: Map<string, 0 | 1 | 2>) => {
      const m = new Map(base);
      for (const w of list) if (!m.has(w.id)) m.set(w.id, difficultyRank(w, progress));
      return m;
    };

    if (!wasBook) {
      // 탭에 새로 들어옴: 이때만 재정렬한다
      setBookDisplay(bookWords);
      setBookRanks(rankOf(bookWords, new Map()));
      return;
    }
    // 머무는 동안 새로 담긴 단어만 뒤에 붙인다
    setBookDisplay((prev) => {
      const shown = new Set(prev.map((w) => w.id));
      const additions = bookWords.filter((w) => !shown.has(w.id));
      if (!additions.length) return prev;
      setBookRanks((r) => rankOf(additions, r));
      return [...prev, ...additions];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookWords, view]);

  // 단어장을 난이도로 묶는다 — 어려운 단어가 맨 위에 오도록.
  const bookGroups = useMemo(() => {
    const buckets: Word[][] = [[], [], []];
    for (const w of bookDisplay) buckets[bookRanks.get(w.id) ?? 0].push(w);
    const meta = [
      { key: "hard", label: "😵 어려움", tone: "text-coral" },
      { key: "easy", label: "😎 쉬움", tone: "text-mint" },
      { key: "done", label: "⭐ 완전 암기", tone: "text-gold" },
    ];
    return meta
      .map((m, i) => ({ ...m, words: buckets[i] }))
      .filter((g) => g.words.length > 0);
  }, [bookDisplay, bookRanks]);

  // 시험에 섞어 낼 '예전에 외운 단어' — 오늘 목록에 없고, 이미 한 번 외운 것들
  const pastWords = useMemo(() => {
    const todayIds = new Set(planWords.list.map((w) => w.id));
    return bandPool.filter((w) => !todayIds.has(w.id) && isKnown(progress[w.id]));
  }, [bandPool, planWords.list, progress]);

  const streak = useMemo(() => streakOf(activity), [activity]);
  const stats = useMemo(() => masteryStats(bandPool, progress), [bandPool, progress]);

  // 새 코스가 생기면 시험 문장형 문항을 백그라운드로 미리 만들어 둔다.
  // (실패해도 규칙 기반 문항만으로 시험은 성립한다)
  const examReq = useRef<string | null>(null);
  useEffect(() => {
    if (!plan || plan.examItems?.length || plan.testPassed) return;
    if (!(CLOUD && userId) || !planWords.list.length) return;
    const key = `${plan.band}.${plan.day}.${plan.newIds[0] ?? ""}`;
    if (examReq.current === key) return;
    examReq.current = key;
    const lvl = BANDS.find((b) => b.id === plan.band)?.label ?? plan.band;
    const payload = planWords.list.map((w) => ({
      kanji: w.kanji,
      kana: w.kana,
      meaning: w.meaning,
      pos: typeLabel(w.type),
    }));
    void generateExam(payload, lvl).then((items) => {
      if (!items) {
        examReq.current = null;
        return;
      }
      setPlan((prev) => {
        if (!prev || prev.examItems?.length || prev.day !== plan.day || prev.band !== plan.band) return prev;
        const next = { ...prev, examItems: items };
        savePlanLocal(userId, next);
        return next;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, userId, planWords.list.length]);

  // 새 코스가 생기면 오늘의 작문 상황을 미리 창작해 홈에 보여준다.
  // (실패해도 스피킹을 열 때 다시 시도하므로 조용히 넘어간다)
  const scenarioReq = useRef<string | null>(null);
  useEffect(() => {
    if (!plan || plan.speakScenario || plan.speakDone || plan.speakSkipped) return;
    if (!(CLOUD && userId)) return;
    const key = `${plan.band}.${plan.day}.${plan.newIds[0] ?? ""}`;
    if (scenarioReq.current === key) return;
    scenarioReq.current = key;
    const lvl = BANDS.find((b) => b.id === plan.band)?.label ?? plan.band;
    void generateScenario(loadRecentScenarios(userId), lvl).then((s) => {
      if (!s) {
        scenarioReq.current = null;
        return;
      }
      pushRecentScenario(userId, s.title);
      setPlan((prev) => {
        if (!prev || prev.speakScenario || prev.day !== plan.day || prev.band !== plan.band)
          return prev;
        const next = { ...prev, speakScenario: s };
        savePlanLocal(userId, next);
        return next;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, userId]);

  function go(v: View) {
    setView(v);
    setMenuOpen(false);
  }

  // ── 로딩 / 로그인 ──
  if (phase === "loading") {
    return (
      <main className="flex min-h-full items-center justify-center text-sm text-mut">
        불러오는 중...
      </main>
    );
  }
  if (phase === "login") return <Login />;

  // ── 난이도 선택 ──
  if (!band || !plan) {
    return (
      <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-6 px-6">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">일본어 하루 코스</h1>
          <p className="mt-2 text-sm text-sub">
            난이도를 고르면 오늘의 코스(단어 + 작문 + 시험)가 만들어져요.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          {BANDS.map((b) => (
            <button
              key={b.id}
              onClick={() => chooseBand(b.id)}
              className="rounded-3xl bg-card px-5 py-4 text-left shadow-soft transition hover:shadow-pop active:scale-[0.98]"
            >
              <div className="text-lg font-bold text-ink">{b.label}</div>
              <div className="mt-0.5 text-xs text-mut">{poolFor(b.id).length}개 단어</div>
            </button>
          ))}
        </div>
      </main>
    );
  }

  const focusMode = FOCUS_VIEWS.includes(view);

  /**
   * 단어장에 담기. 사전에 없는 단어(문장에서 주워 온 토큰)면 먼저 정식 카드를
   * 만들어 DB에 넣고, 그 진짜 단어를 담는다.
   */
  async function addCardToBook(w: Word) {
    if (!isTokenWord(w)) {
      setWordbook((prev) => addToWordbook(userId, [w.id], prev));
      return;
    }
    setSavingCard(true);
    const real = await lookupWord(w.kanji, w.kana);
    setSavingCard(false);
    if (!real) return;
    setWords((prev) => (prev.some((x) => x.id === real.id) ? prev : [...prev, real]));
    setWordbook((prev) => addToWordbook(userId, [real.id], prev));
    setCard((c) => (c && c.word.id === w.id ? { ...c, word: real } : c));
  }

  // 단어 카드 오버레이 (모든 화면 공용) — 카드에서 바로 단어장에 넣을 수 있다
  const cardOverlay = (
    <CardOverlay
      card={card}
      setCard={setCard}
      inBook={card ? wordbook.has(card.word.id) : undefined}
      saving={savingCard}
      onAddBook={card ? () => void addCardToBook(card.word) : undefined}
    />
  );

  // ── 코스 집중 화면 (하단 네비 없음) ──
  if (view === "learn" || view === "relearn") {
    const isReview = view === "relearn";
    return (
      <main className="min-h-full">
        <DailyLearn
          words={planWords.list}
          newCount={planWords.newCount}
          startIndex={isReview ? 0 : plan.learnIndex}
          review={isReview}
          dictionary={words}
          onShowCard={(word, x, y) =>
            setCard((c) => (c && c.word.id === word.id ? null : { word, x, y }))
          }
          onSeen={onSeen}
          onRate={(id, r) => update(id, r === "hard" ? markUnknown : markKnown)}
          onProgress={(i) => updatePlan({ learnIndex: i })}
          onDone={() => {
            if (!isReview) updatePlan({ learnDone: true });
            setView("home");
          }}
          onExit={() => setView("home")}
        />
        {cardOverlay}
      </main>
    );
  }

  if (view === "speak") {
    return (
      <main className="h-full">
        <Speaking
          scenario={plan.speakScenario ?? null}
          recentTitles={loadRecentScenarios(userId)}
          onScenario={(s) => {
            updatePlan({ speakScenario: s });
            pushRecentScenario(userId, s.title);
          }}
          level={BANDS.find((b) => b.id === band)?.label ?? band}
          focusWords={planWords.list.slice(0, Math.min(3, planWords.newCount))}
          dictionary={words}
          initialIntro={plan.speakIntro}
          initialTurns={plan.speakTurns}
          onState={(intro, turns, answered) => {
            // 대화는 기기와 무관하게 남도록 서버에도 그때그때 올린다
            const id = plan.speakLogId ?? crypto.randomUUID();
            updatePlan({ speakIntro: intro, speakTurns: turns, speakStep: answered, speakLogId: id });
            saveSpeakLog(userId, {
              id,
              day: plan.day,
              scenario: plan.speakScenario ?? null,
              intro,
              turns,
              done: answered >= SPEAK_STEPS,
            });
          }}
          onDone={() => {
            updatePlan({ speakDone: true });
            if (plan.speakLogId) {
              saveSpeakLog(userId, {
                id: plan.speakLogId,
                day: plan.day,
                scenario: plan.speakScenario ?? null,
                intro: plan.speakIntro ?? "",
                turns: plan.speakTurns ?? [],
                done: true,
              });
            }
            setView("home");
          }}
          onSkip={() => {
            updatePlan({ speakSkipped: true });
            setView("home");
          }}
          onExit={() => setView("home")}
          onShowCard={(word, x, y) =>
            setCard((c) => (c && c.word.id === word.id ? null : { word, x, y }))
          }
        />
        {cardOverlay}
      </main>
    );
  }

  if (view === "test") {
    return (
      <main className="min-h-full">
        <DailyTest
          words={planWords.list}
          pastWords={pastWords}
          bandWords={bandPool}
          progress={progress}
          examItems={plan.examItems}
          onApplyResults={applyQuizResults}
          onPassed={onTestPassed}
          onExit={() => setView("home")}
        />
      </main>
    );
  }

  // ── 일반 화면 (헤더 + 하단 네비) ──
  return (
    <main
      className={[
        "mx-auto max-w-2xl px-4 pt-4 sm:px-5",
        focusMode ? "pb-6" : "pb-[calc(6.5rem_+_env(safe-area-inset-bottom))]",
      ].join(" ")}
    >
      <header className="mb-4 flex items-center gap-3">
        <h1 className="text-lg font-extrabold text-ink">
          {view === "wordbook" ? "단어장 📚" : view === "speaklog" ? "작문 기록 💬" : "일본어 하루 코스"}
        </h1>
        <select
          value={band}
          onChange={(e) => chooseBand(e.target.value as Band)}
          className="rounded-xl bg-card px-2.5 py-1.5 text-sm font-semibold text-sub shadow-soft"
        >
          {BANDS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </header>

      {(view === "kanji" || view === "tutor" || view === "quiz" || view === "reference" || view === "speaklog") && (
        <button onClick={() => setView("home")} className="mb-3 -mt-1 text-sm font-semibold text-sub transition hover:text-ink">
          ← 홈으로
        </button>
      )}

      {view === "home" ? (
        <Home
          plan={plan}
          scenario={plan.speakScenario ?? null}
          activity={activity}
          streak={streak}
          stats={stats}
          bandLabel={BANDS.find((b) => b.id === band)?.label ?? band}
          newCount={planWords.newCount}
          reviewCount={planWords.list.length - planWords.newCount}
          learnTotal={planWords.list.length}
          onStart={(step) =>
            // 이미 끝낸 단어 단계를 다시 누르면 1번부터 복습 모드로
            setView(step === "learn" && plan.learnDone ? "relearn" : step)
          }
          onNewCycle={newCycle}
        />
      ) : view === "wordbook" ? (
        bookDisplay.length === 0 ? (
          <div className="rounded-3xl bg-card px-6 py-14 text-center text-sm text-mut shadow-soft">
            아직 단어장이 비어 있어요.
            <br />
            하루 코스를 마치거나 촬영으로 넣은 단어가 여기에 쌓여요.
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-2">
              <p className="text-xs leading-relaxed text-mut">
                내 단어 {bookDisplay.length}개. 꾹 누르면 정답,{" "}
                <b className="text-sub">단어를 빠르게 두 번 탭</b>하면{" "}
                <b className="text-gold">완전 암기</b>로 넘어가요.
              </p>
              <button
                onClick={() => setBookReverse((v) => !v)}
                className="ml-auto shrink-0 rounded-xl bg-card px-3 py-1.5 text-xs font-bold text-pri-deep shadow-soft transition active:scale-95"
              >
                {bookReverse ? "한국어 → 일본어" : "일본어 → 한국어"} ⇄
              </button>
            </div>
            <div className="space-y-4">
              {bookGroups.map((g) => (
                <section key={g.key}>
                  <div className="mb-1.5 flex items-baseline gap-2 px-1">
                    <h3 className={["text-sm font-extrabold", g.tone].join(" ")}>{g.label}</h3>
                    <span className="text-xs font-semibold text-mut">{g.words.length}개</span>
                  </div>
                  <WordTable
                    words={g.words}
                    progress={progress}
                    mode={bookReverse ? "ko" : "jp"}
                    onShowCard={(word, x, y) =>
                      setCard((c) => (c && c.word.id === word.id ? null : { word, x, y }))
                    }
                    onSetLevel={(id, lv) =>
                      update(id, lv === "done" ? markRetired : lv === "easy" ? markKnown : markUnknown)
                    }
                  />
                </section>
              ))}
            </div>
          </>
        )
      ) : view === "speaklog" ? (
        <SpeakingLog
          userId={userId}
          dictionary={words}
          onShowCard={(word, x, y) =>
            setCard((c) => (c && c.word.id === word.id ? null : { word, x, y }))
          }
        />
      ) : view === "scan" ? (
        <ScanCapture onSaved={onScanSaved} />
      ) : view === "tutor" ? (
        <Chat />
      ) : view === "quiz" ? (
        <Quiz
          pool={bandPool.filter((w) => (progress[w.id]?.seenCount ?? 0) > 0)}
          bandWords={bandPool}
          progress={progress}
          onApplyResults={applyQuizResults}
          onClose={() => setView("home")}
        />
      ) : view === "reference" ? (
        <Reference />
      ) : (
        <ConfusableCards userId={userId} />
      )}

      {cardOverlay}

      {/* 하단 네비 */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-stretch justify-around px-2">
          <NavBtn label="홈" icon="🏠" active={view === "home"} onClick={() => go("home")} />
          <NavBtn label="단어장" icon="📚" active={view === "wordbook"} onClick={() => go("wordbook")} />
          {CLOUD && userId && (
            <NavBtn label="촬영" icon="📷" active={view === "scan"} onClick={() => go("scan")} />
          )}
          <NavBtn label="더보기" icon="⋯" active={menuOpen} onClick={() => setMenuOpen((o) => !o)} />
        </div>
      </nav>

      {/* 더보기 시트 */}
      {menuOpen && (
        <>
          <button
            type="button"
            aria-label="메뉴 닫기"
            className="fixed inset-0 z-40 cursor-default bg-ink/20"
            onClick={() => setMenuOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-2xl rounded-t-3xl bg-card p-4 pb-[calc(1.25rem_+_env(safe-area-inset-bottom))] shadow-pop">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
            <div className="grid grid-cols-2 gap-2">
              {CLOUD && userId && (
                <SheetBtn icon="💬" label="작문 기록" onClick={() => go("speaklog")} />
              )}
              <SheetBtn icon="📝" label="자유 단어시험" onClick={() => go("quiz")} />
              <SheetBtn icon="🈯" label="닮은꼴 한자" onClick={() => go("kanji")} />
              <SheetBtn icon="📒" label="특수 암기" onClick={() => go("reference")} />
              {CLOUD && userId && <SheetBtn icon="💬" label="튜터" onClick={() => go("tutor")} />}
              {CLOUD && userId && (
                <SheetBtn
                  icon="🚪"
                  label="로그아웃"
                  onClick={() => {
                    setMenuOpen(false);
                    supabase!.auth.signOut({ scope: "local" });
                  }}
                />
              )}
              <SheetBtn
                icon="🔄"
                label={updating ? "새 버전 확인 중…" : "새 버전 받기"}
                onClick={() => {
                  setUpdating(true);
                  void forceUpdate();
                }}
              />
            </div>
            <div className="mt-3 text-center text-[11px] text-mut">버전 {BUILD_ID}</div>
          </div>
        </>
      )}
    </main>
  );
}

function CardOverlay({
  card,
  setCard,
  inBook,
  saving,
  onAddBook,
}: {
  card: { word: Word; x: number; y: number } | null;
  setCard: (c: null) => void;
  inBook?: boolean;
  saving?: boolean;
  onAddBook?: () => void;
}) {
  if (!card) return null;
  return (
    <>
      <button
        type="button"
        aria-label="카드 닫기"
        className="fixed inset-0 z-40 cursor-default"
        onClick={() => setCard(null)}
      />
      <WordCard
        word={card.word}
        x={card.x}
        y={card.y}
        inBook={inBook}
        saving={saving}
        onAddBook={onAddBook}
      />
    </>
  );
}

function NavBtn({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-bold transition",
        active ? "text-pri-deep" : "text-mut hover:text-sub",
      ].join(" ")}
    >
      <span className={["text-xl transition", active ? "scale-110" : ""].join(" ")}>{icon}</span>
      {label}
    </button>
  );
}

function SheetBtn({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-2xl bg-base px-4 py-3 text-left text-sm font-bold text-ink transition hover:bg-pri-soft active:scale-[0.98]"
    >
      <span className="text-lg">{icon}</span>
      {label}
    </button>
  );
}
