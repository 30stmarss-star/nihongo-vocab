import { supabase } from "./supabase";

export type SavedKind = "문장" | "단어" | "문법" | "한자";
export interface SavedDetail {
  text: string;
  reading?: string;
  translation?: string;
  level?: string;
  surface?: string;
  parts?: string;
  on?: string;
  kun?: string;
  radical?: string;
  hint?: string;
  hanja?: { char: string; reading: string }[];
}
export interface SavedCard extends SavedDetail {
  id: string;
  kind: SavedKind;
  note?: string;
  source: { title?: string; episode?: string; url?: string };
  savedAt: string;
  vocabulary?: SavedDetail[];
  grammar?: SavedDetail[];
  kanji?: SavedDetail[];
}

export async function loadSavedCards(userId: string): Promise<SavedCard[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("manga_saved_items")
    .select("id,kind,payload,saved_at")
    .eq("user_id", userId)
    .order("saved_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(row => ({
    ...(row.payload as SavedCard), id: row.id, kind: row.kind as SavedKind, savedAt: row.saved_at,
  }));
}

export async function saveCard(userId: string, card: SavedCard): Promise<void> {
  if (!supabase) throw new Error("계정 연결이 필요합니다.");
  const { error } = await supabase.from("manga_saved_items").upsert({
    id: card.id, user_id: userId, kind: card.kind, payload: card, saved_at: card.savedAt,
  });
  if (error) throw error;
}

export async function deleteCard(userId: string, id: string): Promise<void> {
  if (!supabase) throw new Error("계정 연결이 필요합니다.");
  const { error } = await supabase.from("manga_saved_items").delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
}
