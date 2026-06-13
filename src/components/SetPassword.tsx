import { useState } from "react";
import { supabase } from "../lib/supabase";

/** 로그인한 사용자가 비밀번호를 설정/변경. 매직링크로 들어온 기존 계정에 비밀번호를 부여하는 용도. */
export function SetPassword() {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function save() {
    if (!supabase || busy) return;
    if (pw.length < 6) {
      setOk(false);
      setMsg("6자 이상 입력해 주세요.");
      return;
    }
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) {
      setOk(false);
      setMsg(error.message);
    } else {
      setOk(true);
      setMsg("저장됐어요! 다음부터 이메일+비밀번호로 로그인하면 메일 없이 바로 들어와요.");
      setPw("");
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-xs text-neutral-500 hover:text-neutral-300"
        title="비밀번호 설정"
      >
        🔑 비밀번호
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-white/10 bg-neutral-900 p-3 shadow-xl shadow-black/50">
          <p className="mb-2 text-xs text-neutral-400">
            비밀번호를 정하면 다음부터 <b className="text-neutral-200">메일 없이</b> 로그인할 수
            있어요(모바일에서 매번 로그인되는 문제 해결).
          </p>
          <input
            type="password"
            autoComplete="new-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="새 비밀번호 (6자 이상)"
            className="w-full rounded-lg border border-white/10 bg-neutral-950 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-emerald-400/60"
          />
          <button
            onClick={save}
            disabled={busy}
            className="mt-2 w-full rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {busy ? "저장 중..." : "저장"}
          </button>
          {msg && (
            <p className={`mt-2 text-xs ${ok ? "text-emerald-300" : "text-amber-300"}`}>{msg}</p>
          )}
        </div>
      )}
    </div>
  );
}
