import { useEffect, useMemo, useRef, useState } from "react";
import { BANDS, type Band, type Word } from "./data/types";
import {
  buildWorksheet,
  defaultProgress,
  introduce,
  isKnown,
  markKnown,
  markUnknown,
  type ProgressMap,
} from "./lib/srs";
import {
  DEFAULT_SIZE,
  loadCachedSession,
  loadScannedQueue,
  loadSession,
  persistProgress,
  persistSettings,
} from "./lib/store";
import { CLOUD, supabase } from "./lib/supabase";
import { WordTable } from "./components/WordTable";
import { WordCard } from "./components/WordCard";
import { Login } from "./components/Login";
import { Chat } from "./components/Chat";
import { ConfusableCards } from "./components/ConfusableCards";
import { ScanCapture } from "./components/ScanCapture";
import { SetPassword } from "./components/SetPassword";

const SIZE_OPTIONS = [10, 15, 20, 30];

type View = "study" | "learned" | "kanji" | "tutor" | "scan" | "account";

const HINT_KEY = "hint.longpress.v1";
type Phase = "loading" | "login" | "ready";

export default function App() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [userId, setUserId] = useState<string | null>(null);
  const loadedFor = useRef<string | null | undefined>(undefined);

  const [words, setWords] = useState<Word[]>([]);
  const [progress, setProgress] = useState<ProgressMap>({});
  const [band, setBand] = useState<Band | null>(null);
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [view, setView] = useState<View>("study");
  // 보조 기능(닮은꼴·튜터·계정) 더보기 메뉴 열림 상태
  const [menuOpen, setMenuOpen] = useState(false);
  // 학습지 사용법 안내: 첫 접속 때 1회만 팝업
  const [showHint, setShowHint] = useState(() => {
    try {
      return !localStorage.getItem(HINT_KEY);
    } catch {
      return false;
    }
  });
  // 외운 단어 뷰: false=일본어 보기(뜻 가림), true=뜻 보기(단어·독음 가림, 거꾸로 복습)
  const [learnedReverse, setLearnedReverse] = useState(false);
  // 학습지 뷰 방향: true=한국어→일본어(뜻 보고 단어 떠올리기, 메인 루트), false=일본어→뜻
  const [studyReverse, setStudyReverse] = useState(true);
  const [worksheet, setWorksheet] = useState<Word[]>([]);
  // 촬영으로 넣은 '최우선' 단어 id 집합 (아직 안 외운 것 → 학습지 맨 앞에 고정)
  const [scanned, setScanned] = useState<Set<string>>(new Set());
  const [card, setCard] = useState<{ word: Word; x: number; y: number } | null>(
    null
  );

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
    // 1) 캐시가 있으면 네트워크를 기다리지 않고 즉시 화면을 띄운다(체감 로딩 대폭 단축).
    const cached = loadCachedSession(uid);
    let shownSheet: Word[] | null = null;
    let shownBand: Band | null = null;
    if (cached && cached.words.length) {
      setWords(cached.words);
      setProgress(cached.progress);
      setSize(cached.size);
      if (cached.band) {
        setBand(cached.band);
        const { sheet } = makeSheet(cached.band, cached.size, cached.progress, cached.words);
        setWorksheet(sheet);
        shownSheet = sheet;
        shownBand = cached.band;
      }
      setPhase("ready");
    } else {
      setPhase("loading");
    }

    // 2) 서버에서 최신 데이터를 받아 백그라운드로 반영한다.
    const [s, scannedSet] = await Promise.all([
      loadSession(uid),
      loadScannedQueue(uid),
    ]);
    setWords(s.words);
    setSize(s.size);
    setScanned(scannedSet);

    if (s.band && shownSheet && s.band === shownBand && scannedSet.size === 0) {
      // 이미 캐시로 보여준 학습지는 유지한다(buildWorksheet가 무작위라 다시 만들면 바뀜).
      // 진행상황만 갱신하고, 보여준 학습지의 '도입' 기록은 보존한다.
      setBand(s.band);
      const now = Date.now();
      const next = { ...s.progress };
      const changed: string[] = [];
      for (const w of shownSheet) {
        const intro = introduce(next[w.id], now);
        if (intro !== next[w.id]) {
          next[w.id] = intro;
          changed.push(w.id);
        }
      }
      setProgress(next);
      if (changed.length) persistProgress(uid, next, changed);
    } else if (s.band) {
      // 캐시가 없었거나(첫 방문) 밴드가 달라졌거나 스캔 우선 단어가 있으면 새로 만든다.
      setBand(s.band);
      const { sheet, next, changed } = makeSheet(s.band, s.size, s.progress, s.words, scannedSet);
      setProgress(next);
      setWorksheet(sheet);
      if (changed.length) persistProgress(uid, next, changed);
    } else {
      setProgress(s.progress);
    }
    setPhase("ready");
  }

  function poolFor(b: Band, list: Word[] = words): Word[] {
    const levels = BANDS.find((x) => x.id === b)!.levels;
    return list.filter((w) => levels.includes(w.level));
  }

  /** 학습지 생성 + 새로 등장한 단어를 '도입됨'으로 기록 */
  function makeSheet(
    b: Band,
    n: number,
    prog: ProgressMap,
    list: Word[],
    pri: Set<string> = scanned
  ) {
    const now = Date.now();
    // 밴드 단어 + 스캔 우선 단어(밴드 밖 레벨이어도 포함)의 합집합을 풀로 사용한다.
    const bandPool = poolFor(b, list);
    const inPool = new Set(bandPool.map((w) => w.id));
    const extra = list.filter((w) => pri.has(w.id) && !inPool.has(w.id));
    const pool = extra.length ? [...bandPool, ...extra] : bandPool;
    const sheet = buildWorksheet(pool, prog, n, now, Math.random, pri);
    const next = { ...prog };
    const changed: string[] = [];
    for (const w of sheet) {
      const intro = introduce(next[w.id], now);
      if (intro !== next[w.id]) {
        next[w.id] = intro;
        changed.push(w.id);
      }
    }
    return { sheet, next, changed };
  }

  function regenerate(n: number = size) {
    if (!band) return;
    const { sheet, next, changed } = makeSheet(band, n, progress, words);
    setWorksheet(sheet);
    if (changed.length) {
      setProgress(next);
      persistProgress(userId, next, changed);
    }
  }

  function chooseBand(b: Band) {
    setBand(b);
    persistSettings(userId, b, size);
    const { sheet, next, changed } = makeSheet(b, size, progress, words);
    setWorksheet(sheet);
    if (changed.length) {
      setProgress(next);
      persistProgress(userId, next, changed);
    }
  }

  function changeSize(n: number) {
    setSize(n);
    if (band) persistSettings(userId, band, n);
    regenerate(n);
  }

  /** 촬영 저장 완료: 단어 풀에 병합 + 우선순위 등록 + 학습지 맨 앞에 반영 후 학습지로 이동 */
  function onScanSaved(saved: Word[]) {
    if (!saved.length) return;
    const byId = new Map(words.map((w) => [w.id, w]));
    for (const w of saved) byId.set(w.id, w);
    const merged = [...byId.values()];
    const nextScanned = new Set(scanned);
    for (const w of saved) nextScanned.add(w.id);
    setWords(merged);
    setScanned(nextScanned);
    if (band) {
      const { sheet, next, changed } = makeSheet(band, size, progress, merged, nextScanned);
      setWorksheet(sheet);
      if (changed.length) {
        setProgress(next);
        persistProgress(userId, next, changed);
      }
    }
    setView("study");
  }

  function update(id: string, fn: typeof markKnown) {
    setProgress((prev) => {
      const np = fn(prev[id] ?? defaultProgress(), Date.now());
      const next = { ...prev, [id]: np };
      persistProgress(userId, next, [id]);
      return next;
    });
  }

  const learnedWords = useMemo(
    () => (band ? poolFor(band).filter((w) => isKnown(progress[w.id])) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [band, progress, words]
  );

  function dismissHint() {
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch {
      /* noop */
    }
    setShowHint(false);
  }

  function go(v: View) {
    setView(v);
    setMenuOpen(false);
  }

  // ── 로딩 / 로그인 화면 ──
  if (phase === "loading") {
    return (
      <main className="flex min-h-full items-center justify-center text-sm text-neutral-500">
        불러오는 중...
      </main>
    );
  }
  if (phase === "login") return <Login />;

  // ── 난이도 선택 화면 ──
  if (!band) {
    return (
      <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-6 px-6">
        <div>
          <h1 className="text-2xl font-bold text-white">일본어 단어 암기</h1>
          <p className="mt-2 text-sm text-neutral-400">
            난이도를 고르면 단어 학습지가 만들어져요. 나중에 바꿀 수 있어요.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          {BANDS.map((b) => (
            <button
              key={b.id}
              onClick={() => chooseBand(b.id)}
              className="rounded-2xl border border-white/10 bg-neutral-900 px-5 py-4 text-left transition hover:border-emerald-400/50 hover:bg-neutral-800"
            >
              <div className="text-lg font-semibold text-white">{b.label}</div>
              <div className="mt-0.5 text-xs text-neutral-500">
                {poolFor(b.id).length}개 단어
              </div>
            </button>
          ))}
        </div>
      </main>
    );
  }

  // ── 학습 화면 ──
  return (
    <main className="mx-auto max-w-2xl px-3 pt-5 pb-[calc(9rem_+_env(safe-area-inset-bottom))] sm:px-5">
      <header className="mb-3 flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-bold text-white">일본어 단어 암기</h1>
        <select
          value={band}
          onChange={(e) => chooseBand(e.target.value as Band)}
          className="rounded-lg border border-white/10 bg-neutral-900 px-2 py-1 text-sm text-neutral-200"
        >
          {BANDS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
        {/* 보조 기능: 닮은꼴·튜터·계정을 '더보기' 메뉴로 모음 */}
        <div className="relative ml-auto">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="rounded-lg border border-white/10 bg-neutral-900 px-2.5 py-1 text-sm text-neutral-300 transition hover:border-white/25 hover:text-neutral-100"
          >
            더보기 ⋯
          </button>
          {menuOpen && (
            <>
              <button
                type="button"
                aria-label="메뉴 닫기"
                className="fixed inset-0 z-40 cursor-default"
                onClick={() => setMenuOpen(false)}
              />
              <div
                role="menu"
                className="absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-xl border border-white/10 bg-neutral-900 py-1 shadow-xl shadow-black/50"
              >
                <button
                  role="menuitem"
                  onClick={() => go("kanji")}
                  className="block w-full px-4 py-2 text-left text-sm text-neutral-200 hover:bg-white/5"
                >
                  닮은꼴 한자
                </button>
                {CLOUD && userId && (
                  <button
                    role="menuitem"
                    onClick={() => go("tutor")}
                    className="block w-full px-4 py-2 text-left text-sm text-neutral-200 hover:bg-white/5"
                  >
                    튜터 💬
                  </button>
                )}
                {CLOUD && userId && (
                  <>
                    <div className="my-1 h-px bg-white/10" />
                    <button
                      role="menuitem"
                      onClick={() => go("account")}
                      className="block w-full px-4 py-2 text-left text-sm text-neutral-200 hover:bg-white/5"
                    >
                      🔑 비밀번호 설정
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        supabase!.auth.signOut({ scope: "local" });
                      }}
                      className="block w-full px-4 py-2 text-left text-sm text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
                    >
                      로그아웃
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </header>

      {/* 탭: 학습지 / 외운 단어 */}
      <div className="mb-4 flex gap-1 rounded-xl bg-neutral-900 p-1 text-sm">
        <button
          onClick={() => setView("study")}
          className={`flex-1 rounded-lg px-3 py-1.5 transition ${
            view === "study"
              ? "bg-neutral-700 text-white"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          학습지
        </button>
        <button
          onClick={() => setView("learned")}
          className={`flex-1 rounded-lg px-3 py-1.5 transition ${
            view === "learned"
              ? "bg-neutral-700 text-white"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          외운 단어 {learnedWords.length}
        </button>
        {CLOUD && userId && (
          <button
            onClick={() => setView("scan")}
            className={`flex-1 rounded-lg px-3 py-1.5 transition ${
              view === "scan"
                ? "bg-neutral-700 text-white"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            촬영 📷
          </button>
        )}
      </div>

      {(view === "kanji" || view === "tutor" || view === "account") && (
        <button
          onClick={() => setView("study")}
          className="mb-3 -mt-1 text-sm text-neutral-400 transition hover:text-neutral-200"
        >
          ← 학습으로 돌아가기
        </button>
      )}

      {view === "account" ? (
        <SetPassword inline />
      ) : view === "scan" ? (
        <ScanCapture onSaved={onScanSaved} />
      ) : view === "tutor" ? (
        <Chat />
      ) : view === "kanji" ? (
        <ConfusableCards userId={userId} />
      ) : view === "study" ? (
        <>
          <div className="mb-3 flex items-center gap-2">
            <p className="text-xs text-neutral-500">
              {studyReverse ? "뜻 → 일본어" : "일본어 → 뜻"}
            </p>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <button
                onClick={() => setStudyReverse((v) => !v)}
                className="rounded-lg border border-white/10 bg-neutral-900 px-3 py-1.5 text-sm font-medium text-neutral-200 transition hover:border-emerald-400/50"
                title="보기 방향 전환"
              >
                {studyReverse ? "뜻 → 단어" : "단어 → 뜻"}
              </button>
              <select
                value={size}
                onChange={(e) => changeSize(Number(e.target.value))}
                className="rounded-lg border border-white/10 bg-neutral-900 px-2 py-1 text-sm text-neutral-200"
                title="한 번에 보여줄 단어 수"
              >
                {SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}개씩
                  </option>
                ))}
              </select>
              <button
                onClick={() => regenerate()}
                className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/30"
              >
                새 학습지 ↻
              </button>
            </div>
          </div>

          <WordTable
            words={worksheet}
            progress={progress}
            mode={studyReverse ? "ko" : "jp"}
            onShowCard={(word, x, y) =>
              setCard((c) => (c && c.word.id === word.id ? null : { word, x, y }))
            }
            onKnown={(id) => update(id, markKnown)}
            onUnknown={(id) => update(id, markUnknown)}
          />
        </>
      ) : learnedWords.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-neutral-950/60 px-6 py-12 text-center text-sm text-neutral-500">
          아직 외운 단어가 없어요.
          <br />
          학습지에서 <span className="text-emerald-300">✓</span> 로 체크하면 여기에
          모여요.
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2">
            <p className="text-xs text-neutral-500">
              {learnedReverse
                ? "뜻을 보고 단어를 떠올려 보세요. 오른쪽을 꾹 누르면 정답이 보여요."
                : "지금까지 외운 단어예요. ✓ 를 다시 누르면 목록에서 빠져요."}
            </p>
            <button
              onClick={() => setLearnedReverse((v) => !v)}
              className="ml-auto shrink-0 rounded-lg border border-white/10 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-200 transition hover:border-emerald-400/50"
              title="보기 방향 전환"
            >
              {learnedReverse ? "뜻 → 단어 ✓" : "단어 → 뜻"}
            </button>
          </div>
          <WordTable
            words={learnedWords}
            progress={progress}
            mode={learnedReverse ? "ko" : "jp"}
            onShowCard={(word, x, y) =>
              setCard((c) => (c && c.word.id === word.id ? null : { word, x, y }))
            }
            onKnown={(id) => update(id, markKnown)}
            onUnknown={(id) => update(id, markUnknown)}
          />
        </>
      )}

      {card && (
        <>
          {/* 바깥(또는 카드)을 탭하면 닫힘 */}
          <button
            type="button"
            aria-label="카드 닫기"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setCard(null)}
          />
          <WordCard word={card.word} x={card.x} y={card.y} />
        </>
      )}

      {/* 첫 접속 1회: 학습지 사용법 안내 */}
      {showHint && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-6"
          onClick={dismissHint}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-neutral-900 p-5 shadow-2xl shadow-black/60"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-bold text-white">학습지 사용법</h2>
            <ul className="mt-3 space-y-2 text-sm text-neutral-300">
              <li>
                · <b className="text-neutral-100">오른쪽 영역을 꾹 누르면</b> 정답(독음·뜻)이
                잠깐 보여요.
              </li>
              <li>
                · <b className="text-neutral-100">왼쪽 단어를 누르면</b> 상세 카드가 떠요.
              </li>
              <li>
                · 다 외웠으면 오른쪽 <span className="text-emerald-300">✓</span> 를 눌러
                체크하세요.
              </li>
              <li>
                · 상단 <b className="text-neutral-100">방향 전환</b> 버튼으로 한국어→일본어로도
                연습할 수 있어요.
              </li>
            </ul>
            <button
              onClick={dismissHint}
              className="mt-4 w-full rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400"
            >
              알겠어요
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
