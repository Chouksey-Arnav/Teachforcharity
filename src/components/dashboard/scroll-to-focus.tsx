"use client";
import { useEffect } from "react";

export function ScrollToFocus({ id }: { id: string }) {
  useEffect(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [id]);
  return null;
}
