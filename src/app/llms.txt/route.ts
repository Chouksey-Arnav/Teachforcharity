import { llmsTxt, textResponse } from "@/lib/seo/llms";

export function GET() {
  return textResponse(llmsTxt());
}
