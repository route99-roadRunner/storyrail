import { DEFAULT_PRESETS, instantiatePreset } from "./presets";
import type { Episode, Project } from "./types";
import { uid } from "./types";

export function createEpisode(number: number): Episode {
  const sceneId = uid();
  return {
    id: uid(),
    number,
    title: `${number}화`,
    synopsis: "",
    startState: "",
    targetEndState: "",
    actualResult: "",
    requiredEvents: [],
    unresolvedQuestions: [],
    continuityNotes: [],
    scenes: [
      {
        id: sceneId,
        title: "장면 1",
        purpose: "",
        content: '<p data-paragraph-id="opening">첫 문장을 시작해 보세요.</p>',
      },
    ],
    steps: instantiatePreset(DEFAULT_PRESETS[0]),
    ingredients: [],
    status: "planning",
  };
}

export function createEmptyProject(): Project {
  return {
    schemaVersion: 2,
    id: uid(),
    title: "제목 없는 작품",
    arcs: [],
    foreshadows: [],
    presets: DEFAULT_PRESETS,
    settings: {
      leftPanelWidth: 260,
      rightPanelWidth: 360,
      leftPanelOpen: true,
      rightPanelOpen: true,
      focusMode: false,
    },
    updatedAt: new Date().toISOString(),
  };
}

export function createSampleProject(): Project {
  const episode = createEpisode(1);
  return {
    schemaVersion: 2,
    id: uid(),
    title: "나의 웹소설",
    arcs: [
      {
        id: uid(),
        title: "1부",
        goal: "",
        episodes: [episode],
      },
    ],
    foreshadows: [],
    presets: DEFAULT_PRESETS,
    settings: {
      leftPanelWidth: 260,
      rightPanelWidth: 360,
      leftPanelOpen: true,
      rightPanelOpen: true,
      focusMode: false,
    },
    updatedAt: new Date().toISOString(),
  };
}
