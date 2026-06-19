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
import { SetPassword } from "./components/SetPassword";

const SIZE_OPTIONS = [10, 15, 20, 30];

type View = "study" | "learned" | "kanji" | "tutor";
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
  // 외운 단어 뷰: false=일본어 보기(뜻 가림), true=뜻 보기(단어·독음 가림, 거꾸로 복습)
  const [learnedReverse, setLearnedReverse] = useState(false);
  const [worksheet, setWorksheet] = useState<Word[]>([]);
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
    setPhase("loading");
    const s = await loadSession(uid);
    setWords(s.words);
    setProgress(s.progress);
    setSize(s.size);
    if (s.band) {
      setBand(s.band);
      const { sheet, next, changed } = makeSheet(s.band, s.size, s.progress, s.words);
      setWorksheet(sheet);
      if (changed.length) {
        setProgress(next);
        persistProgress(uid, next, changed);
      }
    }
    setPhase("ready");
  }

  function poolFor(b: Band, list: Word[] = words): Word[] {
    const levels = BANDS.find((x) => x.id === b)!.levels;
    return list.filter((w) => levels.includes(w.level));
  }

  /** 학습지 생성 + 새로 등장한 단어를 '도입됨'으로 기록 */
  function makeSheet(b: Band, n: number, prog: ProgressMap, list: Word[]) {
    const now = Date.now();
    const sheet = buildWorksheet(poolFor(b, list), prog, n, now);
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
        {CLOUD && userId && (
          <div className="ml-auto flex items-center gap-3">
            <SetPassword />
            <button
              onClick={() => supabase!.auth.signOut({ scope: "local" })}
              className="text-xs text-neutral-500 hover:text-neutral-300"
            >
              로그아웃
            </button>
          </div>
        )}
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
        <button
          onClick={() => setView("kanji")}
          className={`flex-1 rounded-lg px-3 py-1.5 transition ${
            view === "kanji"
              ? "bg-neutral-700 text-white"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          닮은꼴
        </button>
        {CLOUD && userId && (
          <button
            onClick={() => setView("tutor")}
            className={`flex-1 rounded-lg px-3 py-1.5 transition ${
              view === "tutor"
                ? "bg-neutral-700 text-white"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            튜터 💬
          </button>
        )}
      </div>

      {view === "tutor" ? (
        <Chat />
      ) : view === "kanji" ? (
        <ConfusableCards />
      ) : view === "study" ? (
        <>
          <div className="mb-3 flex items-center gap-2">
            <p className="text-xs text-neutral-500">
              오른쪽 칸을 <b className="text-neutral-300">꾹 누르면</b> 정답이 잠깐
              보이고, 왼쪽 <b className="text-neutral-300">단어를 누르면</b> 상세 카드가 떠요(다시 누르면 닫힘).
            </p>
            <div className="ml-auto flex shrink-0 items-center gap-2">
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
    </main>
  );
}
