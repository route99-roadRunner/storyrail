import type { Episode } from "./types";

export function completeActiveGuideStep(episode: Episode): Episode {
  const currentIndex = episode.steps.findIndex(
    (step) => step.status === "active",
  );
  if (currentIndex < 0) return episode;

  return {
    ...episode,
    status: episode.status === "planning" ? "writing" : episode.status,
    steps: episode.steps.map((step, index) => ({
      ...step,
      status:
        index === currentIndex
          ? "complete"
          : index === currentIndex + 1
            ? "active"
            : step.status,
    })),
  };
}
