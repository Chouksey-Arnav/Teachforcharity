"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isArea } from "@/lib/updates";

/** "Mark all as read" (optionally just one area, from a filtered view). */
export async function markAllUpdatesRead(formData: FormData) {
  const area = formData.get("area");
  const supabase = await createClient();
  await supabase.rpc("mark_updates_read", isArea(area) ? { p_area: area } : {});
  revalidatePath("/dashboard", "layout");
}
