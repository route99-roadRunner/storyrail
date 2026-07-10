export type Id = string;

export type EpisodeStatus = "planning" | "writing" | "complete";
export type StepStatus = "pending" | "active" | "complete" | "skipped";
export type IngredientStatus = "unused" | "used" | "moved" | "excluded";
export type Priority = "required" | "recommended" | "optional";
export type ForeshadowStatus =
  "planned" | "active" | "ready" | "resolved" | "discarded";
export type ForeshadowEventType = "plant" | "remind" | "misdirect" | "resolve";

export interface ParagraphRef {
  sceneId: Id;
  paragraphId: Id;
}

export interface GuideStep {
  id: Id;
  title: string;
  instruction: string;
  status: StepStatus;
  paragraphRefs: ParagraphRef[];
}

export interface Ingredient {
  id: Id;
  category: string;
  title: string;
  description: string;
  priority: Priority;
  status: IngredientStatus;
  paragraphRefs: ParagraphRef[];
  movedToEpisodeId?: Id;
}

export interface Scene {
  id: Id;
  title: string;
  purpose: string;
  content: string;
}

export interface Episode {
  id: Id;
  number: number;
  title: string;
  synopsis: string;
  startState: string;
  targetEndState: string;
  actualResult: string;
  requiredEvents: string[];
  unresolvedQuestions: string[];
  continuityNotes: string[];
  scenes: Scene[];
  steps: GuideStep[];
  ingredients: Ingredient[];
  status: EpisodeStatus;
}

export interface Arc {
  id: Id;
  title: string;
  goal: string;
  episodes: Episode[];
}

export interface ForeshadowEvent {
  id: Id;
  type: ForeshadowEventType;
  plannedEpisodeId: Id;
  actualEpisodeId?: Id;
  paragraphRefs: ParagraphRef[];
  status: "planned" | "complete" | "skipped";
  note: string;
}

export interface Foreshadow {
  id: Id;
  title: string;
  truth: string;
  readerBelief: string;
  status: ForeshadowStatus;
  events: ForeshadowEvent[];
}

export interface GuidePreset {
  id: Id;
  title: string;
  description: string;
  steps: Array<Pick<GuideStep, "title" | "instruction">>;
}

export interface ProjectSettings {
  leftPanelWidth: number;
  rightPanelWidth: number;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  focusMode: boolean;
}

export interface Project {
  schemaVersion: 1;
  id: Id;
  title: string;
  arcs: Arc[];
  foreshadows: Foreshadow[];
  presets: GuidePreset[];
  settings: ProjectSettings;
  updatedAt: string;
}

export interface Selection {
  arcId: Id;
  episodeId: Id;
  sceneId: Id;
}

export type SaveStatus = "loading" | "saved" | "saving" | "error";

export const uid = () => crypto.randomUUID();
