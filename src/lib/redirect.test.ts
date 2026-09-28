import { describe, expect, it } from "vitest";
import { safeNext } from "./redirect";

describe("safeNext", () => {
  it("keeps same-site paths with queries and fragments", () => {
    expect(safeNext("/dashboard")).toBe("/dashboard");
    expect(safeNext("/dashboard/lessons?tab=action#x")).toBe("/dashboard/lessons?tab=action#x");
    expect(safeNext("/admin/people?q=a%20b")).toBe("/admin/people?q=a%20b");
  });

  it.each([
    ["protocol-relative", "//evil.com"],
    ["backslash host", "/\\evil.com"],
    ["backslash later", "/\\/evil.com"],
    ["tab stripped by browsers", "/\t/evil.com"],
    ["newline stripped by browsers", "/\n/evil.com"],
    ["carriage return", "/\r/evil.com"],
    ["null byte", "/\0/evil.com"],
    ["DEL", "/\x7f/evil.com"],
    ["absolute URL", "https://evil.com"],
    ["scheme", "javascript:alert(1)"],
    ["relative", "dashboard"],
    ["empty", ""],
  ])("rejects %s", (_, input) => {
    expect(safeNext(input)).toBe("/dashboard");
  });

  it("rejects non-strings and uses the fallback", () => {
    expect(safeNext(undefined, "/x")).toBe("/x");
    expect(safeNext(null)).toBe("/dashboard");
    expect(safeNext(["/a"])).toBe("/dashboard");
  });

  it("never returns something a browser would treat as another host", () => {
    for (let c = 0; c < 128; c++) {
      const ch = String.fromCharCode(c);
      const out = safeNext(`/${ch}/evil.com`);
      // What a browser does before parsing: strip ASCII tab/newline, treat \\ as /.
      const normalized = out.replace(/[\t\n\r]/g, "").replace(/\\/g, "/");
      expect(normalized.startsWith("//")).toBe(false);
    }
  });
});
