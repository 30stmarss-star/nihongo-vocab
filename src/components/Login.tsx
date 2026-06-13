import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

/** Supabase 오류 메시지를 한국어 안내로 변환 */
function friendly(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials"))
    return "이메일 또는 비밀번호가 맞지 않아요. 처음이면 아래 '메일 링크로 로그인'으로 들어와서 비밀번호를 설정하세요.";
  if (m.includes("rate limit") || m.includes("too many") || m.includes("only request") || m.includes("seconds"))
    return "메일 발송 한도에 걸렸어요. 잠시 후 다시 시도하거나, 비밀번호로 로그인하세요.";
  if (m.includes("email not confirmed"))
    return "이메일 인증이 필요해요. 받은 메일의 링크를 먼저 눌러 주세요.";
  return msg;
}

/** 이메일+비밀번호 로그인(기본) + 매직링크(비상용). */
export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "link">("password");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase || busy) return;
    setBusy(true);
    setErr(null);

    if (mode === "password") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) setErr(friendly(error.message));
      // 성공 시 App의 onAuthStateChange가 화면을 전환한다.
    } else {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
      });
      setBusy(false);
      if (error) setErr(friendly(error.message));
      else setSent(true);
    }
  }

  return (
    <main className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-2xl font-bold text-white">일본어 단어 암기</h1>
        <p className="mt-2 text-sm text-neutral-400">
          {mode === "password"
            ? "이메일과 비밀번호로 로그인하세요."
            : "이메일로 일회용 로그인 링크를 보내드려요."}
        </p>
      </div>

      {sent ? (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-5 py-6 text-sm text-emerald-200">
          <b>{email}</b> 로 로그인 링크를 보냈어요. 메일함의 링크를 누르면 바로 로그인됩니다.
          <p className="mt-3 text-xs text-emerald-300/80">
            로그인 후 화면 위 <b>🔑 비밀번호</b>에서 비밀번호를 정해두면, 다음부턴 메일 없이
            바로 로그인할 수 있어요.
          </p>
          <button
            onClick={() => {
              setSent(false);
              setMode("password");
            }}
            className="mt-3 block text-xs text-emerald-300/80 hover:text-emerald-200"
          >
            ← 비밀번호 로그인으로 돌아가기
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            autoFocus
            autoComplete="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-xl border border-white/10 bg-neutral-900 px-4 py-3 text-white outline-none focus:border-emerald-400/60"
          />

          {mode === "password" && (
            <input
              type="password"
              required
              autoComplete="current-password"
              placeholder="비밀번호"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-xl border border-white/10 bg-neutral-900 px-4 py-3 text-white outline-none focus:border-emerald-400/60"
            />
          )}

          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-emerald-500 px-4 py-3 font-medium text-white transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {busy
              ? "처리 중..."
              : mode === "password"
                ? "로그인"
                : "로그인 링크 받기"}
          </button>

          {err && <p className="text-sm text-amber-300">{err}</p>}

          <button
            type="button"
            onClick={() => {
              setErr(null);
              setMode((m) => (m === "password" ? "link" : "password"));
            }}
            className="mt-1 text-center text-xs text-neutral-500 hover:text-neutral-300"
          >
            {mode === "password"
              ? "비밀번호가 없거나 잊으셨나요? 메일 링크로 로그인"
              : "← 비밀번호로 로그인"}
          </button>
        </form>
      )}
    </main>
  );
}
