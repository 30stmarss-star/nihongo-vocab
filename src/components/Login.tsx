import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

/** 매직링크(비밀번호 없는) 로그인. 이메일로 일회용 로그인 링크를 보냄. */
export function Login() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setSent(true);
  }

  return (
    <main className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-2xl font-bold text-white">일본어 단어 암기</h1>
        <p className="mt-2 text-sm text-neutral-400">
          이메일을 넣으면 로그인 링크를 보내드려요. 비밀번호는 없어요.
        </p>
      </div>

      {sent ? (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-5 py-6 text-sm text-emerald-200">
          <b>{email}</b> 로 로그인 링크를 보냈어요. 메일함의 링크를 누르면 바로
          로그인됩니다.
          <button
            onClick={() => setSent(false)}
            className="mt-3 block text-xs text-emerald-300/80 hover:text-emerald-200"
          >
            다른 이메일로 다시 보내기
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            autoFocus
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-xl border border-white/10 bg-neutral-900 px-4 py-3 text-white outline-none focus:border-emerald-400/60"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-emerald-500 px-4 py-3 font-medium text-white transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {busy ? "보내는 중..." : "로그인 링크 받기"}
          </button>
          {err && <p className="text-sm text-amber-300">{err}</p>}
        </form>
      )}
    </main>
  );
}
