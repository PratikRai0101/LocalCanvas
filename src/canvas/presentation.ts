type FrameCandidate = {
  id: string;
  type: string;
  isDeleted: boolean;
};

export function presentationFrames<T extends FrameCandidate>(elements: readonly T[]) {
  return elements.filter((element) =>
    !element.isDeleted && (element.type === "frame" || element.type === "magicframe"),
  );
}
