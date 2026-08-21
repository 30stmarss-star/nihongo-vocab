import { useEffect, useRef, useState } from "react";
import {
  fileToMangaImage,
  isSupportedImage,
  readManga,
  type MangaGrammar,
  type MangaKanji,
  type MangaReadResult,
  type MangaVocab,
} from "../lib/manga";

/**
 * 만화 판독 화면.
 *
 * 탭으로 대사·어휘·문법을 갈라두면 한 대사를 공부하려고 탭을 세 번 오가야 한다.
 * 그래서 **대사 하나가 블록 하나**다. 원문 → 후리가나 → 번역 → 그 대사의 어휘·문법·한자·참고가
 * 한 덩어리로 붙고, 위에서 아래로 읽어 내려가면 페이지 하나가 끝난다.
 *
 * 캡처는 위에 고정해 둔다. 세로쓰기를 눈으로 좇으면서 풀이를 봐야 하는데
 * 스크롤할 때마다 그림이 사라지면 어느 말풍선 얘기인지 놓친다.
 *
 * 다음 페이지 입력은 결과 맨 아래에 상주한다. 읽던 흐름이 끊기지 않게.
 * 이미지는 판독하는 동안만 메모리에 있고, 화면을 떠나면 사라진다. 저장하지 않는다.
 */

type Stage = "pick" | "reading" | "done";

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
  const [err, setErr] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [imgOpen, setImgOpen] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);

  const start = async (file: File) => {
    if (busy.current) return;
    // 이미지가 아니면 조용히 무시한다 — 다른 걸 복사하다 잘못 눌리는 경우가 잦다.
    if (!isSupportedImage(file)) return;

    busy.current = true;
    setErr(null);
    setResult(null);
    setImgOpen(true);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    setStage("reading");
    topRef.current?.scrollIntoView({ block: "start" });
    try {
      const image = await fileToMangaImage(file);
      const read = await readManga(image, title);
      setResult(read);
      setStage("done");
      topRef.current?.scrollIntoView({ block: "start" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "판독 중 오류가 났어요.");
      setStage("pick");
    } finally {
      busy.current = false;
    }
  };

  // 붙여넣기는 window 에서 받는다 — 결과를 읽는 중에도 바로 다음 장을 넣을 수 있게.
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

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const dropProps = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files?.[0];
      if (f) void start(f);
    },
  };

  const forLine = <T extends { line_index: number }>(list: T[], i: number) =>
    list.filter((x) => x.line_index === i);
  const loose = <T extends { line_index: number }>(list: T[]) =>
    list.filter((x) => x.line_index < 0);

  return (
    <div className="space-y-3">
      <div ref={topRef} />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void start(f);
          e.target.value = "";
        }}
      />

      {/* 작품 이름 — 결과를 보는 중엔 접어둔다(자리를 많이 먹는다) */}
      {stage !== "done" && (
        <label className="block rounded-2xl bg-card p-3 shadow-soft">
          <span className="mb-1 block text-[10px] font-bold text-mut">지금 읽는 작품</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 하이큐!! 3권"
            className="w-full rounded-lg border border-line bg-card px-2 py-1.5 text-sm text-ink outline-none focus:border-pri"
          />
        </label>
      )}

      {err && (
        <div className="rounded-xl border border-gold/30 bg-gold-soft px-3 py-2 text-sm text-gold">
          {err}
        </div>
      )}

      {/* ── 캡처: 결과를 읽는 내내 위에 붙어 있는다 ── */}
      {preview && stage !== "pick" && (
        <div className="sticky top-0 z-20 -mx-4 bg-page/95 px-4 pb-2 pt-2 backdrop-blur sm:-mx-5 sm:px-5">
          <div className="overflow-hidden rounded-2xl bg-card shadow-soft">
            {imgOpen && (
              <img
                src={preview}
                alt="판독 중인 페이지"
                className={[
                  "mx-auto max-h-[38vh] w-auto max-w-full object-contain transition",
                  stage === "reading" ? "opacity-50" : "",
                ].join(" ")}
              />
            )}
            <button
              onClick={() => setImgOpen((v) => !v)}
              className="w-full border-t border-line py-1.5 text-[11px] font-bold text-mut transition hover:text-sub"
            >
              {imgOpen ? "원본 접기 ▲" : "원본 펼치기 ▼"}
            </button>
          </div>
        </div>
      )}

      {/* ── 판독 중 ── */}
      {stage === "reading" && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-sub">
          <span className="inline-flex gap-1">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-mut [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-mut [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-mut" />
          </span>
          페이지를 읽는 중…
        </div>
      )}

      {/* ── 첫 진입: 입력만 ── */}
      {stage === "pick" && <DropZone {...dropProps} dragging={dragging} onPick={() => fileRef.current?.click()} big />}

      {/* ── 결과: 대사마다 한 덩어리로 쭉 ── */}
      {stage === "done" && result && (
        <div className="space-y-3">
          {result.gist && (
            <p className="rounded-2xl bg-card px-4 py-3 text-sm leading-relaxed text-sub shadow-soft">
              {result.gist}
            </p>
          )}

          {result.lines.length === 0 && (
            <div className="rounded-2xl bg-card px-6 py-12 text-center text-sm text-mut shadow-soft">
              읽어낼 수 있는 대사가 없었어요.
              <br />더 크게 잘라서 다시 넣어보세요.
            </div>
          )}

          {result.lines.map((l, i) => {
            const v = forLine(result.vocab, i);
            const g = forLine(result.grammar, i);
            const k = forLine(result.kanji, i);
            return (
              <article key={i} className="rounded-2xl bg-card p-4 shadow-soft">
                {/* 대사 */}
                <div className="flex gap-2.5">
                  <span className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-pri-soft text-[10px] font-bold text-pri-deep">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xl leading-relaxed text-ink">{l.jp}</div>
                    <div className="mt-1 text-xs leading-relaxed text-mut">{l.kana}</div>
                    <div className="mt-1.5 text-base font-semibold leading-relaxed text-pri-deep">
                      {l.ko}
                    </div>
                  </div>
                </div>

                {l.note && (
                  <div className="mt-3 rounded-xl bg-page px-3 py-2 text-xs leading-relaxed text-sub">
                    <b className="text-ink">참고</b> · {l.note}
                  </div>
                )}

                {v.length > 0 && (
                  <Section label="어휘">
                    {v.map((w, j) => (
                      <VocabRow key={j} v={w} />
                    ))}
                  </Section>
                )}
                {g.length > 0 && (
                  <Section label="문법">
                    {g.map((x, j) => (
                      <GrammarRow key={j} g={x} />
                    ))}
                  </Section>
                )}
                {k.length > 0 && (
                  <Section label="漢字">
                    {k.map((x, j) => (
                      <KanjiRow key={j} k={x} />
                    ))}
                  </Section>
                )}
              </article>
            );
          })}

          {/* 대사에 못 붙는 것들 — 간판·효과음에서 온 어휘/한자 */}
          {(loose(result.vocab).length > 0 ||
            loose(result.grammar).length > 0 ||
            loose(result.kanji).length > 0) && (
            <article className="rounded-2xl bg-card p-4 shadow-soft">
              <h3 className="text-sm font-extrabold text-ink">대사 밖에서</h3>
              <p className="mt-0.5 text-xs text-mut">간판·나레이션·효과음 쪽에서 나온 것들</p>
              {loose(result.vocab).length > 0 && (
                <Section label="어휘">
                  {loose(result.vocab).map((w, j) => (
                    <VocabRow key={j} v={w} />
                  ))}
                </Section>
              )}
              {loose(result.grammar).length > 0 && (
                <Section label="문법">
                  {loose(result.grammar).map((x, j) => (
                    <GrammarRow key={j} g={x} />
                  ))}
                </Section>
              )}
              {loose(result.kanji).length > 0 && (
                <Section label="漢字">
                  {loose(result.kanji).map((x, j) => (
                    <KanjiRow key={j} k={x} />
                  ))}
                </Section>
              )}
            </article>
          )}

          {/* 효과음 */}
          {result.sfx.length > 0 && (
            <article className="rounded-2xl bg-card p-4 shadow-soft">
              <h3 className="text-sm font-extrabold text-ink">효과음</h3>
              <ul className="mt-2.5 flex flex-wrap gap-1.5">
                {result.sfx.map((s, i) => (
                  <li
                    key={i}
                    className="flex items-baseline gap-1.5 rounded-xl bg-page px-2.5 py-1.5"
                  >
                    <span className="text-sm font-bold text-ink">{s.jp}</span>
                    <span className="text-[11px] text-sub">{s.ko}</span>
                  </li>
                ))}
              </ul>
            </article>
          )}

          {/* 다음 장 — 읽던 자리에서 바로 이어서 */}
          <DropZone {...dropProps} dragging={dragging} onPick={() => fileRef.current?.click()} />
        </div>
      )}
    </div>
  );
}

/** 대사 블록 안의 소제목 + 내용 */
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mt-3 border-t border-line pt-3">
      <h4 className="mb-2 text-[11px] font-extrabold tracking-wide text-mut">{label}</h4>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

/** 표제어는 세로쓰기 — 원서에서 시선을 옮겨오는 비용을 줄인다 */
function VocabRow({ v }: { v: MangaVocab }) {
  return (
    <div className="flex gap-3">
      <div
        style={{ writingMode: "vertical-rl" }}
        className="shrink-0 text-xl font-bold leading-none tracking-wide text-ink"
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
        <div className="mt-0.5 text-sm font-semibold text-pri-deep">{v.ko}</div>
        {v.surface && v.surface !== v.word && (
          <div className="mt-0.5 text-xs text-sub">
            본문에선 <b className="text-ink">{v.surface}</b>
          </div>
        )}
        {v.parts && <div className="mt-0.5 text-xs leading-relaxed text-mut">{v.parts}</div>}
      </div>
    </div>
  );
}

function GrammarRow({ g }: { g: MangaGrammar }) {
  return (
    <div>
      <span className="rounded-md bg-pri-soft px-1.5 py-0.5 text-sm font-bold text-pri-deep">
        {g.point}
      </span>
      <p className="mt-1 text-xs leading-relaxed text-sub">{g.ko}</p>
    </div>
  );
}

function KanjiRow({ k }: { k: MangaKanji }) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 text-2xl font-bold leading-none text-ink">{k.char}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-pri-deep">{k.ko}</div>
        <div className="mt-0.5 text-xs text-mut">
          음 {k.on || "—"} · 훈 {k.kun || "—"}
          {k.radical && ` · 부수 ${k.radical}`}
        </div>
        {k.hint && <div className="mt-0.5 text-xs leading-relaxed text-sub">{k.hint}</div>}
      </div>
    </div>
  );
}

/** 페이지를 넣는 자리. 결과 아래에도 상주해서 읽던 흐름이 끊기지 않게 한다. */
function DropZone({
  dragging,
  onPick,
  big,
  ...drop
}: {
  dragging: boolean;
  onPick: () => void;
  big?: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  return (
    <div
      {...drop}
      className={[
        "rounded-2xl bg-card shadow-soft transition",
        big ? "p-4" : "p-3",
        dragging ? "ring-2 ring-pri" : "",
      ].join(" ")}
    >
      <div
        className={[
          "flex flex-col items-center gap-3 text-center",
          big ? "py-8" : "py-4",
        ].join(" ")}
      >
        <div className={["leading-relaxed text-sub", big ? "text-sm" : "text-xs"].join(" ")}>
          {big ? (
            <>
              막히는 페이지를 <b className="text-ink">캡처해서 붙여넣으세요</b>.
              <br />
              대사마다 어휘·문법·참고를 풀어서 보여줘요.
            </>
          ) : (
            <b className="text-ink">다음 페이지</b>
          )}
        </div>
        <button
          onClick={onPick}
          className={[
            "rounded-2xl bg-pri font-semibold text-white transition hover:bg-pri-deep",
            big ? "px-6 py-3 text-base" : "px-5 py-2 text-sm",
          ].join(" ")}
        >
          📖 사진 고르기
        </button>
        <div className="text-xs leading-relaxed text-mut">
          <kbd className="rounded bg-page px-1.5 py-0.5 font-sans">Ctrl</kbd>+
          <kbd className="rounded bg-page px-1.5 py-0.5 font-sans">V</kbd> 로 바로 붙여넣거나 끌어다 놓아도 돼요.
        </div>
      </div>
    </div>
  );
}
