import { useRef, useState } from "react";
import type { Level, Word, WordType } from "../data/types";
import {
  extractWords,
  fileToScanImage,
  saveWords,
  type ScanCandidate,
} from "../lib/scan";

/**
 * 촬영 → 인식 → 검토·수정 → 저장.
 * 저장된 단어는 단어 풀에 편입되고, 학습지 맨 앞(최우선)에 뜬다.
 * (자동으로 '외운 단어'가 되진 않는다 — 학습지에서 직접 ✓ 해야 넘어간다.)
 */

const LEVELS: Level[] = ["N5", "N4", "N3", "N2", "N1"];
const POS_OPTIONS: { value: WordType["kind"]; label: string }[] = [
  { value: "noun", label: "명사" },
  { value: "verb", label: "동사" },
  { value: "i-adj", label: "い형용사" },
  { value: "na-adj", label: "な형용사" },
  { value: "adverb", label: "부사" },
  { value: "expression", label: "표현" },
];

type Stage = "pick" | "extracting" | "review" | "saving";

interface Row {
  cand: ScanCandidate;
  include: boolean;
}

export function ScanCapture({ onSaved }: { onSaved: (words: Word[]) => void }) {
  const [stage, setStage] = useState<Stage>("pick");
  const [previews, setPreviews] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setErr(null);
    setNotice(null);
    const list = Array.from(files).slice(0, 6); // 한 번에 최대 6장
    setPreviews(list.map((f) => URL.createObjectURL(f)));
    setStage("extracting");
    try {
      const images = await Promise.all(list.map(fileToScanImage));
      const cands = await extractWords(images);
      if (!cands.length) {
        setErr("인식된 단어가 없어요. 더 밝고 반듯하게, 글자가 크게 나오도록 다시 찍어보세요.");
        setStage("pick");
        return;
      }
      setRows(cands.map((c) => ({ cand: c, include: true })));
      setStage("review");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "인식 중 오류가 났어요.");
      setStage("pick");
    }
  }

  function edit(i: number, patch: Partial<ScanCandidate>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, cand: { ...r.cand, ...patch } } : r)));
  }
  function toggle(i: number) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, include: !r.include } : r)));
  }

  async function save() {
    const chosen = rows.filter((r) => r.include).map((r) => r.cand);
    if (!chosen.length) {
      setErr("저장할 단어를 하나 이상 선택하세요.");
      return;
    }
    setErr(null);
    setStage("saving");
    try {
      const saved = await saveWords(chosen);
      onSaved(saved);
      setNotice(`${saved.length}개를 학습지 맨 앞에 추가했어요! 학습지 탭에서 바로 만나요.`);
      reset();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "저장 중 오류가 났어요.");
      setStage("review");
    }
  }

  function reset() {
    previews.forEach((u) => URL.revokeObjectURL(u));
    setPreviews([]);
    setRows([]);
    setStage("pick");
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-neutral-950/60 p-4">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => void onFiles(e.target.files)}
      />

      {notice && (
        <div className="mb-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          {notice}
        </div>
      )}
      {err && (
        <div className="mb-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          {err}
        </div>
      )}

      {/* ── 촬영/선택 ── */}
      {stage === "pick" && (
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <div className="text-sm text-neutral-400">
            교재·노트·손글씨를 찍으면 <b className="text-neutral-200">일본어를 인식</b>해서
            <br />
            단어·독음·뜻·레벨을 자동으로 정리해요.
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            className="rounded-2xl bg-emerald-500 px-6 py-3 text-base font-semibold text-white transition hover:bg-emerald-400"
          >
            📷 사진 찍기 / 고르기
          </button>
          <div className="text-xs text-neutral-500">
            밝고 반듯하게, 한 번에 최대 6장. 손글씨는 또박또박할수록 정확해요.
          </div>
        </div>
      )}

      {/* ── 인식 중 ── */}
      {stage === "extracting" && (
        <div className="flex flex-col items-center gap-4 py-8">
          {previews.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2">
              {previews.map((u, i) => (
                <img key={i} src={u} alt="" className="h-24 w-24 rounded-lg object-cover opacity-70" />
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-neutral-400">
            <span className="inline-flex gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-500 [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-500 [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-500" />
            </span>
            글자를 읽고 단어를 뽑는 중…
          </div>
        </div>
      )}

      {/* ── 검토·수정 ── */}
      {(stage === "review" || stage === "saving") && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <p className="text-xs text-neutral-500">
              인식 결과를 확인하고 <b className="text-neutral-300">틀린 건 고치거나 빼고</b> 저장하세요.
              저장하면 학습지 맨 앞에 떠요.
            </p>
            <span className="ml-auto shrink-0 text-xs text-neutral-400">
              {rows.filter((r) => r.include).length}/{rows.length} 선택
            </span>
          </div>

          <ul className="space-y-2">
            {rows.map((r, i) => (
              <li
                key={i}
                className={[
                  "rounded-xl border p-3 transition",
                  r.include
                    ? "border-white/10 bg-neutral-900"
                    : "border-white/5 bg-neutral-900/40 opacity-50",
                ].join(" ")}
              >
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => toggle(i)}
                    aria-pressed={r.include}
                    className={[
                      "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md text-xs transition",
                      r.include
                        ? "bg-emerald-500 text-white"
                        : "border border-white/25 text-transparent",
                    ].join(" ")}
                  >
                    ✓
                  </button>
                  <div className="flex-1 space-y-1.5">
                    <div className="flex gap-1.5">
                      <input
                        value={r.cand.kanji}
                        onChange={(e) => edit(i, { kanji: e.target.value })}
                        placeholder="표제어"
                        className="w-[42%] rounded-lg border border-white/10 bg-neutral-950 px-2 py-1.5 text-base text-white outline-none focus:border-emerald-400/60"
                      />
                      <input
                        value={r.cand.kana}
                        onChange={(e) => edit(i, { kana: e.target.value })}
                        placeholder="독음(히라가나)"
                        className="flex-1 rounded-lg border border-white/10 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-200 outline-none focus:border-emerald-400/60"
                      />
                    </div>
                    <input
                      value={r.cand.meaning}
                      onChange={(e) => edit(i, { meaning: e.target.value })}
                      placeholder="한국어 뜻"
                      className="w-full rounded-lg border border-white/10 bg-neutral-950 px-2 py-1.5 text-sm text-emerald-300 outline-none focus:border-emerald-400/60"
                    />
                    <div className="flex gap-1.5">
                      <select
                        value={r.cand.level}
                        onChange={(e) => edit(i, { level: e.target.value as Level })}
                        className="rounded-lg border border-white/10 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-200"
                      >
                        {LEVELS.map((lv) => (
                          <option key={lv} value={lv}>
                            {lv}
                          </option>
                        ))}
                      </select>
                      <select
                        value={r.cand.pos}
                        onChange={(e) => edit(i, { pos: e.target.value as WordType["kind"] })}
                        className="rounded-lg border border-white/10 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-200"
                      >
                        {POS_OPTIONS.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex gap-2">
            <button
              onClick={reset}
              disabled={stage === "saving"}
              className="rounded-xl border border-white/10 bg-neutral-900 px-4 py-2 text-sm text-neutral-300 transition hover:border-white/25 disabled:opacity-40"
            >
              다시 찍기
            </button>
            <button
              onClick={() => void save()}
              disabled={stage === "saving" || !rows.some((r) => r.include)}
              className="flex-1 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-40"
            >
              {stage === "saving"
                ? "저장 중…"
                : `${rows.filter((r) => r.include).length}개 학습지에 추가`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
