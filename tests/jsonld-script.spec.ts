/**
 * jsonLdScript — the JSON-LD <script> serializer must make a tag break-out
 * impossible even when third-party feed text contains `</script>` or a lone
 * `</script`. Guards the stored-XSS fix: bare JSON.stringify does NOT escape
 * `<`, so a crafted place/event title could execute. The escaped output must
 * stay byte-identical to a JSON parser (round-trips) while containing no raw
 * `<`, `>`, `&`, or the U+2028/U+2029 separators.
 */
import { describe, it, expect } from "vitest";
import { jsonLdScript } from "@/lib/seo/jsonld";

const LS = String.fromCharCode(0x2028); // line separator
const PS = String.fromCharCode(0x2029); // paragraph separator

describe("jsonLdScript", () => {
  it("escapes a </script> breakout in a feed-derived field", () => {
    const out = jsonLdScript({ name: "Free Show </script><svg onload=alert(document.domain)>" });
    expect(out).not.toContain("</script");
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(out).toContain("\\u003c"); // escaped <
  });

  it("escapes a lone </script with no closing > (survives balanced-tag strip)", () => {
    const out = jsonLdScript({ title: "Trivia </script and more" });
    expect(out.toLowerCase()).not.toContain("</script");
  });

  it("escapes & and the U+2028/U+2029 line separators", () => {
    const out = jsonLdScript({ a: "Tom & Jerry", b: `x${LS}y${PS}z` });
    expect(out).not.toContain("&");
    expect(out).not.toContain(LS);
    expect(out).not.toContain(PS);
    expect(out).toContain("\\u0026");
    expect(out).toContain("\\u2028");
    expect(out).toContain("\\u2029");
  });

  it("stays byte-identical to a JSON parser (round-trips)", () => {
    const obj = { "@type": "Event", name: "A < B & C > D", nested: { x: [1, "</script>"] } };
    expect(JSON.parse(jsonLdScript(obj))).toEqual(obj);
  });
});
