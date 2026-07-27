import type { SceneVersion } from "../library/api";

// History arrives newest-first; the scrubber intentionally runs oldest → newest.
export function timelineVersionAt(versions: readonly SceneVersion[], index: number) {
  return versions[versions.length - 1 - index] ?? null;
}

export function timelineVersionIndex(versions: readonly SceneVersion[], versionId: string) {
  const newestFirstIndex = versions.findIndex((version) => version.id === versionId);
  return newestFirstIndex < 0 ? null : versions.length - 1 - newestFirstIndex;
}
