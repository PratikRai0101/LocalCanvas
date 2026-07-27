import { describe, expect, it } from "vitest";
import { timelineVersionAt, timelineVersionIndex } from "../src/history/timeline";

const versions = [
  { id: "newest", createdAt: 30, byteLength: 300 },
  { id: "middle", createdAt: 20, byteLength: 200 },
  { id: "oldest", createdAt: 10, byteLength: 100 },
];

describe("history timeline", () => {
  it("maps its left-to-right range from oldest to newest", () => {
    expect(timelineVersionAt(versions, 0)?.id).toBe("oldest");
    expect(timelineVersionAt(versions, 2)?.id).toBe("newest");
  });

  it("finds the range index for a selected version", () => {
    expect(timelineVersionIndex(versions, "middle")).toBe(1);
    expect(timelineVersionIndex(versions, "missing")).toBeNull();
  });
});
