import { llmsFullTxt, textResponse } from "@/lib/seo/llms";

export function GET() {
  return textResponse(llmsFullTxt());
}
