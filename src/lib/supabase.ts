import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 설정돼 있으면 클라우드 모드.
// 없으면 로컬(브라우저 저장) 모드로 동작한다.
const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const CLOUD = Boolean(url && anon);

export const supabase: SupabaseClient | null = CLOUD
  ? createClient(url as string, anon as string)
  : null;
