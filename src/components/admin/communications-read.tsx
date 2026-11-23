"use client";

import { useEffect, useState } from "react";
import { markAdminCommunicationRead } from "@/app/actions/admin-communications";
import { Notice } from "@/components/ui/notice";

export function CommunicationsRead({ threadId }: { threadId: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    markAdminCommunicationRead(threadId).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [threadId]);
  return failed ? <Notice tone="warning">Could not mark this conversation as read. Try opening it again.</Notice> : null;
}
