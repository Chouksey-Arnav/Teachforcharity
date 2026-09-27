import { SearchX } from "lucide-react";
import { Empty } from "@/components/ui/empty";
import { LinkButton } from "@/components/ui/button";

export default function DashboardNotFound() {
  return (
    <Empty icon={<SearchX className="size-5" />} title="We couldn’t find that" action={<LinkButton href="/dashboard">Back to your dashboard</LinkButton>}>
      It may have been removed, or you may not have access to it. Everything you can see is in the menu.
    </Empty>
  );
}
