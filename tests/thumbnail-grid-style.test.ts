import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("thumbnail grid hover styling", () => {
  it("does not clip the lifted thumbnail outline", async () => {
    const stylesheet = await readFile("src/App.css", "utf8");

    expect(stylesheet).toMatch(
      /\.drawing-card\s*\{[^}]*overflow:\s*visible;/s,
    );
  });
});
