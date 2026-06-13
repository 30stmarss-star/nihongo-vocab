import { useEffect, useReducer } from "react";
import { getSync, subSync } from "../lib/syncDebug";

/** 임시 동기화 진단 표시줄(화면 하단). 문제 해결 후 제거. */
export function SyncDebug() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => subSync(force), []);
  const { load, save } = getSync();
  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] bg-black/85 px-2 py-1 text-center font-mono text-[10px] leading-tight text-emerald-300">
      <div>{load || "load: …"}</div>
      <div>{save || "save: …"}</div>
    </div>
  );
}
