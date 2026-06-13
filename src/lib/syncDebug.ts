// 임시 동기화 진단용. 모바일에서 콘솔을 못 보니 화면 하단에 상태를 띄운다.
// 문제 해결 후 제거 예정.
let load = "";
let save = "";
const subs = new Set<() => void>();

export function pushLoad(s: string) {
  load = s;
  subs.forEach((f) => f());
}
export function pushSave(s: string) {
  save = s;
  subs.forEach((f) => f());
}
export function getSync() {
  return { load, save };
}
export function subSync(f: () => void) {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}
