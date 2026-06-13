# 일본어 단어 암기 (nihongo-vocab)

JLPT 단어 암기 웹앱. 난이도(N5·N4 / N3 / N2) 선택, 가림/꾹눌러보기, 상세 카드,
간격반복(SRS) + 중요도 우선 학습지, 외운 단어 모아보기, 오프라인(PWA) 지원.

- **배포 주소**: https://30stmarss-star.github.io/nihongo-vocab/
- 백엔드: Supabase (Postgres + Auth + Edge Function + cron)
- 단어 자동 확장: Edge Function `generate-words` 가 Claude API로 단어 생성 → DB 저장

> 앱을 **쓰기만** 할 거면 위 주소로 접속해 로그인하면 끝(어느 기기든 동기화).
> 아래는 **다른 컴퓨터에서 개발/배포**할 때의 세팅입니다.

---

## 다른 컴퓨터에서 개발 시작

필요한 것: Node 20+ , git (배포까지 하려면 `gh` CLI).

```bash
git clone https://github.com/30stmarss-star/nihongo-vocab.git
cd nihongo-vocab
npm install
```

`.env.local` 파일을 만들어 아래 두 값을 넣는다 (Supabase anon 키는 공개용이라 안전):

```
VITE_SUPABASE_URL=https://auvcrexjkoxvymzytlxp.supabase.co
VITE_SUPABASE_ANON_KEY=<Supabase 대시보드 → Settings → API → anon public>
```

```bash
npm run dev   # http://localhost:5173  (클라우드 모드: 같은 DB/로그인)
```

`.env.local` 이 없으면 자동으로 **로컬 모드**(내장 시드 단어 + 브라우저 저장)로 동작한다.

---

## 배포

### 프론트엔드 (GitHub Pages)
```bash
gh auth login                      # 새 컴퓨터에서 1회
npm run build -- --base=/nihongo-vocab/
# dist/ 를 gh-pages 브랜치로 푸시 (자세히는 아래 스크립트 참고)
```

### Edge Function (단어 생성기)
Supabase 액세스 토큰 필요 (대시보드 → Account → Access Tokens):
```bash
SUPABASE_ACCESS_TOKEN=sbp_xxx npx supabase functions deploy generate-words \
  --project-ref auvcrexjkoxvymzytlxp --use-api
```
DB 스키마 변경 등은 `supabase/schema.sql` 참고. 전체 배포 절차는 `SETUP.md`.

### 비밀 값이 사는 곳
- `ANTHROPIC_API_KEY` : Supabase Edge Function Secrets (서버 전용, 로컬 불필요)
- Supabase `service_role` : 서버/관리 작업용 (절대 프론트·깃에 넣지 않음)
- `VITE_SUPABASE_ANON_KEY` : 공개용 (프론트에 포함되어도 안전, RLS로 보호)

---

## 스크립트
- `npm run dev` / `build` / `preview`
- `npm run generate -- <N5|N4|N3|N2> <개수>` : 로컬에서 단어 생성 (ANTHROPIC_API_KEY 필요)
- `npx tsx scripts/seed-to-db.ts` : 시드 단어 DB 업로드 (SERVICE_ROLE 필요)
