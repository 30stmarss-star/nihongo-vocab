import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

// 빌드 식별자(배포 확인용). 콘솔에서 이 값이 보이면 최신 번들이 로드된 것.
const BUILD_ID = "2026-07-04-14";
console.info("[nihongo-vocab] build", BUILD_ID);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
