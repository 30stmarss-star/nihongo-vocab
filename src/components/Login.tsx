import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

/** Supabase 오류 메시지를 한국어 안내로 변환 */
function friendly(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("rate limit") || m.includes("too many") || m.includes("only request") || m.includes("seconds"))
    return "메일 발송 한도에 걸렸어요. 1분쯤 뒤에 다시 시도해 주세요.";
  if (m.includes("expired") || m.includes("invalid"))
    return "코드가 맞지 않거나 만료됐어요. 다시 확인하거나 새 코드를 받아 주세요.";
  return msg;
}

/**
 * 비밀번호 없는 이메일 인증 로그인.
 * 이메일 입력 → 인증 메일 발송 → 메일의 인증 코드 입력(또는 메일 링크 클릭).
 */
export function Login() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearInterval(t);
  }, [cooldown > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  async function sendMail() {
    if (!supabase || busy || cooldown > 0) return;
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
    });
    setBusy(false);
    if (error) {
      setErr(friendly(error.message));
    } else {
      setStep("code");
      setCooldown(60);
    }
  }

  async function submitEmail(e: FormEvent) {
    e.preventDefault();
    void sendMail();
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    if (!supabase || busy || code.trim().length < 6) return;
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    if (error) setErr(friendly(error.message));
    // 성공 시 App의 onAuthStateChange가 화면을 전환한다.
  }

  return (
    <main className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-2xl font-extrabold text-ink">일본어 하루 코스</h1>
        <p className="mt-2 text-sm text-sub">
          {step === "email"
            ? "비밀번호 없이 이메일 인증으로 로그인해요. 처음이면 자동으로 가입됩니다."
            : "메일로 보낸 인증 코드를 입력하세요. 메일 속 링크를 눌러도 로그인돼요."}
        </p>
      </div>

      {step === "email" ? (
        <form onSubmit={submitEmail} className="flex flex-col gap-3">
          <input
            type="email"
            required
            autoFocus
            autoComplete="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-2xl bg-card px-4 py-3.5 text-ink shadow-soft outline-none focus:ring-2 focus:ring-pri/50"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-2xl bg-pri px-4 py-3.5 font-bold text-white shadow-soft transition hover:bg-pri-deep active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? "메일 보내는 중..." : "인증 메일 받기 ✉️"}
          </button>
          {err && <p className="text-sm text-coral">{err}</p>}
        </form>
      ) : (
        <form onSubmit={submitCode} className="flex flex-col gap-3">
          <div className="rounded-2xl bg-pri-soft px-4 py-3 text-sm leading-relaxed text-pri-deep">
            <b>{email}</b> 로 인증 메일을 보냈어요.
          </div>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={8}
            autoFocus
            placeholder="인증 코드"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="rounded-2xl bg-card px-4 py-3.5 text-center text-2xl font-bold tracking-[0.3em] text-ink shadow-soft outline-none focus:ring-2 focus:ring-pri/50"
          />
          <button
            type="submit"
            disabled={busy || code.length < 6}
            className="rounded-2xl bg-pri px-4 py-3.5 font-bold text-white shadow-soft transition hover:bg-pri-deep active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? "확인 중..." : "로그인"}
          </button>
          {err && <p className="text-sm text-coral">{err}</p>}
          <div className="mt-1 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setCode("");
                setErr(null);
              }}
              className="text-mut hover:text-sub"
            >
              ← 이메일 다시 입력
            </button>
            <button
              type="button"
              disabled={cooldown > 0 || busy}
              onClick={() => void sendMail()}
              className="font-semibold text-pri-deep disabled:text-mut"
            >
              {cooldown > 0 ? `재발송 (${cooldown}초)` : "메일 재발송"}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
