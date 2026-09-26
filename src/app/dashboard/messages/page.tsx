import type { Metadata } from "next";
import { MessageCircle } from "lucide-react";

export const metadata: Metadata = { title: "Messages" };

export default function MessagesIndex() {
  return (
    <div className="hidden h-full flex-col items-center justify-center p-10 text-center lg:flex">
      <span className="flex size-12 items-center justify-center rounded-full bg-paper-2 text-pine-700">
        <MessageCircle className="size-5" />
      </span>
      <p className="display mt-4 text-3xl">Pick a conversation</p>
      <p className="mt-2 max-w-sm text-sm text-muted">
        Messages are for coordinating lessons. Phone numbers, emails, links, and social handles are blocked automatically to keep everyone safe.
      </p>
    </div>
  );
}
