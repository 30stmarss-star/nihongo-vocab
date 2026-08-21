import { useEffect, useRef, useState } from "react";
import {
  fileToMangaImage,
  isSupportedImage,
  readManga,
  type MangaReadResult,
} from "../lib/manga";

/**
 * 만화 판독 화면.
 *
 * 원서를 읽다 막힌 페이지를 붙여넣으면 대사·어휘·한자·효과음을 풀어서 보여준다.
 * 이 화면은 **읽고 넘기는 용도**다. 단어장 편입은 다음 단계(M3)에서 붙는다.
 *
 * 이미지는 판독하는 동안만 메모리에 있고, 화면을 떠나면 사라진다. 저장하지 않는다.
 */

type Stage = "pick" | "reading" | "done";
type Tab = "lines" | "vocab" | "kanji" | "sfx";

const TABS: { id: Tab; label: string }[] = [
  { id: "lines", label: "대사" },
  { id: "vocab", label: "어휘" },
  { id: "kanji", label: "漢字" },
  { id: "sfx", label: "효과음" },
];

const LEVEL_TONE: Record<string, string> = {
  N5: "bg-mint-soft text-mint",
  N4: "bg-mint-soft text-mint",
  N3: "bg-pri-soft text-pri-deep",
  N2: "bg-gold-soft text-gold",
  N1: "bg-coral-soft text-coral",
};

export function MangaRead() {
  const [stage, setStage] = useState<Stage>("pick");
  const [title, setTitle] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<MangaReadResult | null>(null);
  const [tab, setTab] = useState<Tab>("lines");
  const [err, setErr] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // 판독 중에 또 붙여넣는 걸 막기 위해, 리스너가 최신 상태를 보게 한다.
  const busy = useRef(false);

  const start = async (file: File) => {
    if (busy.current) return;
    if (!isSupportedImage(file)) {
      // 이미지가 아니면 조용히 무시한다 — 다른 걸 복사하다 잘못 눌리는 경우가 잦다.
      return;
    }
    busy.current = true;
    setErr(null);
    setResult(null);
    setTab("lines");
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    setStage("reading");
    try {
      const image = await fileToMangaImage(file);
      const read = await readManga(image, title);
      setResult(read);
      setStage("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "판독 중 오류가 났어요.");
      setStage("pick");
    } finally {
      busy.current = false;
    }
  };

  // ── 붙여넣기 (포커스 위치와 무관하게 window 에서 받는다) ──
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind !== "file") continue;
        const file = item.getAsFile();
        if (file && isSupportedImage(file)) {
          e.preventDefault();
          void start(file);
          return;
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, preview]);

  // 화면을 떠날 때 미리보기 URL 회수
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const reset = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setResult(null);
    setErr(null);
    setStage("pick");
    if (fileRef.current) fileRef.current.value = "";
  };

  const count = (t: Tab) =>
    !result
      ? 0
      : t === "lines"
        ? result.lines.length
        : t === "vocab"
          ? result.vocab.length
          : t === "kanji"
            ? result.kanji.length
            : result.sfx.length;

  return (
    <div className="space-y-3">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void start(f);
        }}
      />

      {/* ── 작품 이름 (세션에 한 번) ── */}
      <label className="block rounded-2xl bg-card p-3 shadow-soft">
        <span className="mb-1 block text-[10px] font-bold text-mut">지금 읽는 작품</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 하이큐!! 3권"
          className="w-full rounded-lg border border-line bg-card px-2 py-1.5 text-sm text-ink outline-none focus:border-pri"
        />
      </label>

      {err && (
        <div className="rounded-xl border border-gold/30 bg-gold-soft px-3 py-2 text-sm text-gold">
          {err}
        </div>
      )}

      {/* ── 입력 영역 ── */}
      {stage !== "done" && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void start(f);
          }}
          className={[
            "rounded-2xl bg-card p-4 shadow-soft transition",
            dragging ? "ring-2 ring-pri" : "",
          ].join(" ")}
        >
          {stage === "pick" ? (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="text-sm leading-relaxed text-sub">
                막히는 페이지를 <b className="text-ink">캡처해서 붙여넣으세요</b>.
                <br />
                대사·어휘·한자를 풀어서 보여줘요.
              </div>
              <button
                onClick={() => fileRef.current?.click()}
                className="rounded-2xl bg-pri px-6 py-3 text-base font-semibold text-white transition hover:bg-pri-deep"
              >
                📖 사진 고르기
              </button>
              <div className="text-xs leading-relaxed text-mut">
                <kbd className="rounded bg-page px-1.5 py-0.5 font-sans">Ctrl</kbd>+
                <kbd className="rounded bg-page px-1.5 py-0.5 font-sans">V</kbd> 로 바로 붙여넣거나,
                <br />
                이 영역에 이미지를 끌어다 놓아도 돼요.
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-8">
              {preview && (
                <img
                  src={preview}
                  alt=""
                  className="max-h-48 rounded-lg object-contain opacity-60"
                />
              )}
              <div className="flex items-center gap-2 text-sm text-sub">
                <span className="inline-flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-mut [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-mut [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-mut" />
                </span>
                페이지를 읽는 중…
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 판독 결과 ── */}
      {stage === "done" && result && (
        <div className="rounded-2xl bg-card p-4 shadow-soft">
          {result.gist && (
            <p className="mb-3 text-sm leading-relaxed text-sub">{result.gist}</p>
          )}

          <div role="tablist" aria-label="판독 결과" className="mb-4 flex gap-1.5 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={[
                  "shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold transition",
                  tab === t.id
                    ? "bg-pri text-white"
                    : "bg-page text-sub hover:text-ink",
                ].join(" ")}
              >
                {t.label}
                <span className={tab === t.id ? "ml-1 text-white/70" : "ml-1 text-mut"}>
                  {count(t.id)}
                </span>
              </button>
            ))}
          </div>

          <div role="tabpanel">
            {/* 대사 — 세로로 세우지 않는다. 스크롤 방향이 꼬인다. */}
            {tab === "lines" &&
              (result.lines.length === 0 ? (
                <Empty>읽어낼 수 있는 대사가 없었어요.</Empty>
              ) : (
                <ol className="space-y-3">
                  {result.lines.map((l, i) => (
                    <li key={i} className="flex gap-2.5">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-pri-soft text-[10px] font-bold text-pri-deep">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-lg leading-relaxed text-ink">{l.jp}</div>
                        <div className="mt-0.5 text-xs text-mut">{l.kana}</div>
                        <div className="mt-1 text-sm text-pri-deep">{l.ko}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              ))}

            {/* 어휘 — 표제어만 세로쓰기. 원서에서 시선을 옮겨오는 비용을 줄인다. */}
            {tab === "vocab" &&
              (result.vocab.length === 0 ? (
                <Empty>따로 짚을 어휘가 없었어요.</Empty>
              ) : (
                <ul className="space-y-2">
                  {result.vocab.map((v, i) => (
                    <li key={i} className="rounded-xl border border-line p-3">
                      <div className="flex gap-3">
                        <div
                          style={{ writingMode: "vertical-rl" }}
                          className="shrink-0 text-2xl font-bold leading-none tracking-wide text-ink"
                        >
                          {v.word}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs text-mut">{v.reading}</span>
                            <span
                              className={[
                                "rounded px-1.5 py-0.5 text-[10px] font-bold",
                                LEVEL_TONE[v.level] ?? "bg-page text-sub",
                              ].join(" ")}
                            >
                              {v.level} 추정
                            </span>
                          </div>
                          <div className="mt-1 text-sm font-semibold text-pri-deep">{v.ko}</div>
                          {v.surface && v.surface !== v.word && (
                            <div className="mt-1 text-xs text-sub">
                              본문에선 <b className="text-ink">{v.surface}</b>
                            </div>
                          )}
                          {v.parts && <div className="mt-1 text-xs text-mut">{v.parts}</div>}
                          {v.line_index >= 0 && result.lines[v.line_index] && (
                            <div className="mt-2 border-l-2 border-line pl-2 text-xs leading-relaxed text-sub">
                              {result.lines[v.line_index].jp}
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ))}

            {tab === "kanji" &&
              (result.kanji.length === 0 ? (
                <Empty>짚을 한자가 없었어요.</Empty>
              ) : (
                <ul className="space-y-2">
                  {result.kanji.map((k, i) => (
                    <li key={i} className="flex gap-3 rounded-xl border border-line p-3">
                      <div className="shrink-0 text-3xl font-bold leading-none text-ink">
                        {k.char}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-pri-deep">{k.ko}</div>
                        <div className="mt-0.5 text-xs text-mut">
                          음 {k.on || "—"} · 훈 {k.kun || "—"}
                          {k.radical && ` · 부수 ${k.radical}`}
                        </div>
                        {k.hint && <div className="mt-1 text-xs text-sub">{k.hint}</div>}
                      </div>
                    </li>
                  ))}
                </ul>
              ))}

            {tab === "sfx" &&
              (result.sfx.length === 0 ? (
                <Empty>효과음이 없었어요.</Empty>
              ) : (
                <ul className="space-y-1.5">
                  {result.sfx.map((s, i) => (
                    <li
                      key={i}
                      className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-xl border border-line px-3 py-2"
                    >
                      <span className="text-base font-bold text-ink">{s.jp}</span>
                      <span className="text-xs text-sub">{s.ko}</span>
                    </li>
                  ))}
                </ul>
              ))}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={reset}
              className="flex-1 rounded-xl bg-page px-4 py-2 text-sm font-semibold text-sub transition hover:text-ink"
            >
              다음 페이지 읽기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-mut">{children}</div>;
}
