import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { InstrumentSupply } from "@/lib/public-forms";

/**
 * Tutor counts per instrument for the public finder. Never names or profiles. Returns null if the counts can't be
 * loaded (for example before the database migration that adds them), and callers hide the counts rather than
 * showing zeros that aren't true.
 */
export const getInstrumentSupply = cache(async (): Promise<InstrumentSupply[] | null> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("public_instrument_supply");
    if (error || !Array.isArray(data)) return null;
    return (data as unknown as InstrumentSupply[]).filter((i) => i && typeof i.slug === "string");
  } catch {
    return null;
  }
});
