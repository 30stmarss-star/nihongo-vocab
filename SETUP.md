# 자동 확장 시스템 배포 가이드

목표: **웹에 올려두면 컴퓨터 없이도** 단어가 자동으로 늘어나고, 로그인하면 모든 기기에서 학습이 이어지는 구조.

```
[브라우저(React)] ── 로그인/단어/진행상황 ──> [Supabase: Auth + Postgres]
                                                      ▲
                          매일 크론 ──> [Edge Function: generate-words]
                                                      │ Claude API 호출(키는 서버에만)
                                                      ▼
                                              새 단어를 words 테이블에 저장
```

> 설정 안 하면 앱은 그대로 **로컬 모드**(브라우저 저장)로 잘 돌아갑니다. 아래는 클라우드 모드를 켜는 절차예요.

---

## 1. Supabase 프로젝트 만들기
1. https://supabase.com → 새 프로젝트 생성 (무료 티어 OK)
2. **Project Settings → API** 에서 다음 3개를 확인해 둡니다:
   - `Project URL`
   - `anon public` 키
   - `service_role` 키 (⚠️ 절대 프론트엔드/깃에 넣지 말 것 — 서버 전용)

## 2. DB 스키마 적용
- Supabase 대시보드 → **SQL Editor** → `supabase/schema.sql` 내용을 붙여넣고 실행.

## 3. 프론트엔드에 키 연결
- 프로젝트 루트에 `.env.local` 생성 (`.env.example` 참고):
  ```
  VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
  VITE_SUPABASE_ANON_KEY=eyJ...anon...
  ```
- `npm run dev` 재시작 → 이제 로그인 화면이 뜨면 성공.

### 매직링크 설정 (Authentication → URL Configuration)
매직링크는 메일의 링크를 눌렀을 때 **앱 주소로 되돌아와야** 로그인이 완료됩니다. 대시보드 → **Authentication → URL Configuration**에서:
- **Site URL**: 배포 주소(예: `https://yourname.github.io/nihongo-vocab`)
- **Redirect URLs**: 개발용 `http://localhost:5173` 와 배포 주소를 모두 추가
- (Authentication → Providers → **Email** 이 켜져 있어야 함 — 기본 켜짐)

> 코드에서 `emailRedirectTo: window.location.origin` 으로 현재 주소로 돌아오게 돼 있어요. 위 목록에 그 주소가 없으면 링크가 거부되니 꼭 등록하세요. 본인만 쓰면 Supabase 기본 메일로 충분합니다(시간당 발송 제한만 유의).

## 4. 시드 단어를 DB로 올리기 (최초 1회)
손으로 검수한 ~120개를 먼저 채워 둡니다.
```bash
SUPABASE_URL=https://YOUR-PROJECT.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ...service_role... \
npx tsx scripts/seed-to-db.ts
```

## 5. 서버 생성기(Edge Function) 배포
Supabase CLI 설치 후:
```bash
supabase login
supabase link --project-ref YOUR-PROJECT-REF

# 비밀키 등록 (서버에만 저장됨)
supabase secrets set ANTHROPIC_API_KEY=sk-ant-... FUNCTION_SECRET=$(openssl rand -hex 16)

# 함수 배포
supabase functions deploy generate-words --no-verify-jwt
```
수동 테스트:
```bash
curl -X POST https://YOUR-PROJECT.supabase.co/functions/v1/generate-words \
  -H "x-secret: <위에서 만든 FUNCTION_SECRET>" \
  -H "content-type: application/json" \
  -d '{"level":"N3","count":20}'
# → {"ok":true,"added":{"N3":20}}  (본문 없이 호출하면 부족한 레벨을 자동 보충)
```

### 대화형 튜터(tutor-chat) 배포
앱의 **튜터 💬** 탭이 쓰는 함수입니다. `generate-words` 와 같은 `ANTHROPIC_API_KEY` 를 공유합니다.
```bash
# generate-words 와 달리 --no-verify-jwt 를 붙이지 않는다 → 로그인한 사용자만 호출 가능
supabase functions deploy tutor-chat
```
> 프론트의 \`supabase.functions.invoke("tutor-chat", …)\` 가 로그인 사용자의 토큰을 자동으로 실어 보내고,
> Supabase가 JWT를 검증하므로 별도 비밀키(x-secret)가 필요 없습니다. 비로그인/로컬 모드에선 탭이 보이지 않습니다.
> 모델/말투를 바꾸려면 \`supabase/functions/tutor-chat/index.ts\` 의 \`MODEL\`·\`SYSTEM\` 을 수정하세요.

## 6. 자동(크론) — 컴퓨터 없이 매일 확장
1) 대시보드 → **Database → Extensions**에서 **`pg_cron`** 과 **`pg_net`** 을 켭니다.
2) **SQL Editor**에서 아래 실행(매일 1회 함수 호출). `<ANON_KEY>`는 anon public 키:
```sql
select cron.schedule(
  'generate-words-daily',
  '0 3 * * *',                       -- 매일 03:00 UTC
  $$
  select net.http_post(
    url     := 'https://YOUR-PROJECT.supabase.co/functions/v1/generate-words',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <ANON_KEY>',
      'content-type', 'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);
```
> 본문 `{}` = 자동 모드(부족한 레벨을 PER_RUN_CAP만큼 보충). 목표치에 도달하면 생성이 멈춥니다.
> 해제하려면: `select cron.unschedule('generate-words-daily');`

## 7. 프론트엔드 배포 (비밀키 없음 — 정적 파일만)
백엔드는 전부 Supabase라, 프론트는 정적 파일을 올릴 곳만 있으면 됩니다.

- **GitHub Pages** (추가 계정 0, GitHub 사용 시): 레포가 `user.github.io/repo` 경로면 `vite.config.ts`에 `base: "/repo/"`를 추가하고 `npm run build` 결과 `dist`를 Pages로 배포. 빌드 시 `VITE_SUPABASE_URL`·`VITE_SUPABASE_ANON_KEY`를 환경변수(또는 `.env.local`)로 주입.
- **또는 Vercel / Netlify / Cloudflare Pages**: 빌드 `npm run build`, 출력 `dist`, 환경변수 `VITE_SUPABASE_URL`·`VITE_SUPABASE_ANON_KEY` 등록.

배포 끝 → 폰에서도 같은 주소로 로그인해 이어서 학습. (anon 키는 공개돼도 안전 — 실제 권한은 RLS가 통제)

---

### 비용 메모
- 단어 생성은 Claude API(`claude-opus-4-8`) 사용. 100개에 대략 $0.2~0.5.
- 더 저렴하게: `supabase/functions/generate-words/index.ts`의 `MODEL`을 `claude-sonnet-4-6`로 변경.
- 목표치 도달 후엔 생성이 멈추므로 비용이 무한정 늘지 않습니다.
