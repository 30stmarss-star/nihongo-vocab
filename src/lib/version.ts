// 빌드 식별자(배포 확인용). 배포마다 값을 올린다.
// 더보기 메뉴에 표시되고, 콘솔에도 찍힌다.
export const BUILD_ID = "2026-07-26-21";

/**
 * iOS 홈 화면 PWA는 새로고침 수단이 없어 번들이 오래 남는다.
 * 서비스워커에게 즉시 업데이트 확인을 시키고(설치·활성화까지 잠깐 대기) 리로드한다.
 */
export async function forceUpdate(): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.update().catch(() => {})));
      // 새 워커가 있으면 skipWaiting(autoUpdate 설정)으로 곧 활성화된다. 잠깐 기다렸다 리로드.
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  } catch {
    // 실패해도 리로드는 시도한다.
  }
  window.location.reload();
}
