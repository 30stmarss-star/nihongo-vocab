import { useState, type ReactNode } from "react";
import { CONFUSABLE_GROUPS, type ConfusableKanji } from "../data/confusables";

/**
 * 닮은꼴 한자 비교 카드.
 *  - 한자, 구별 포인트(distinguish_ko), 뜻, 예문 단어는 항상 보인다(레퍼런스/문맥).
 *  - "읽기"(reading_key)와 예문 후리가나는 가려져 있고, 탭하면 함께 드러난다(한자→읽기 회상).
 * 손가락이 글자를 덮지 않도록 '꾹 누르기'가 아니라 '탭 토글' 방식.
 */
export function ConfusableCards() {
  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-500">
        헷갈리기 쉬운 한자를 묶었어요. <b className="text-neutral-300">구별 포인트</b>와 뜻을 보고,
        가려진 <b className="text-neutral-300">읽기를 탭하면</b> 드러나요(다시 탭하면 가림).
      </p>
      {CONFUSABLE_GROUPS.map((g) => (
        <section
          key={g.group_id}
          className="overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/60"
        >
          <div className="border-b border-white/10 px-4 py-2.5 text-sm font-semibold text-white">
            {g.group_label}
          </div>
          <ul className="divide-y divide-white/5">
            {g.kanji.map((k) => (
              <KanjiEntry key={k.kanji} k={k} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function KanjiEntry({ k }: { k: ConfusableKanji }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <li className="flex items-stretch gap-3 px-4 py-3">
      {/* 한자: 항상 보임 */}
      <div className="flex w-[56px] shrink-0 items-center justify-center">
        <span className="text-4xl leading-none text-white">{k.kanji}</span>
      </div>

      {/* 오른쪽: 탭하면 읽기/후리가나가 토글된다. 행 전체가 터치 영역. */}
      <button
        type="button"
        onClick={() => setRevealed((v) => !v)}
        aria-pressed={revealed}
        aria-label={revealed ? "읽기 가리기" : "읽기 보기"}
        className="no-select min-w-0 flex-1 text-left"
        style={{ touchAction: "manipulation" }}
      >
        {/* 구별 포인트 + 뜻: 항상 */}
        <div className="text-xs leading-snug text-amber-300/90">
          {k.distinguish_ko}
        </div>
        <div className="mt-0.5 text-sm text-emerald-300">{k.meaning_ko}</div>

        {/* 읽기: 가림 → 탭 */}
        <Mask revealed={revealed} className="mt-1.5">
          <span className="text-base text-neutral-100">{k.reading_key}</span>
        </Mask>

        {/* 예문: 단어·뜻은 항상, 후리가나만 가림 */}
        <div className="mt-1.5 text-sm leading-snug">
          <span className="text-xs text-neutral-500">예)</span>{" "}
          <span className="text-neutral-200">{k.example.word}</span>{" "}
          <Mask revealed={revealed} inline>
            <span className="text-neutral-400">{k.example.reading}</span>
          </Mask>{" "}
          <span className="text-neutral-500">· {k.example.meaning_ko}</span>
        </div>
      </button>
    </li>
  );
}

/** 평소엔 가림 막대, 탭하면 내용이 드러나는 칸. inline이면 글자 폭만큼만 가린다. */
function Mask({
  revealed,
  className,
  inline,
  children,
}: {
  revealed: boolean;
  className?: string;
  inline?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={[
        "relative",
        inline ? "inline-block align-baseline" : "block min-h-[1.75rem] py-1",
        className ?? "",
      ].join(" ")}
    >
      <span
        className={[
          "transition-opacity duration-200",
          inline ? "inline-block" : "block",
          revealed ? "opacity-100" : "opacity-0",
        ].join(" ")}
      >
        {children}
      </span>
      <span
        aria-hidden
        className={[
          "absolute inset-0 rounded-md bg-white/10 transition-opacity duration-200",
          revealed ? "opacity-0" : "opacity-100",
        ].join(" ")}
      />
    </span>
  );
}
