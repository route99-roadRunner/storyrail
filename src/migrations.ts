import type { Project, ProjectSettings } from "./types";

export const CURRENT_SCHEMA_VERSION = 2;

const DEFAULT_SETTINGS: ProjectSettings = {
  leftPanelWidth: 260,
  rightPanelWidth: 360,
  leftPanelOpen: true,
  rightPanelOpen: true,
  focusMode: false,
};

type StoredProject = Omit<Project, "schemaVersion"> & { schemaVersion: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertProjectShape(value: unknown): asserts value is StoredProject {
  if (
    !isRecord(value) ||
    typeof value.schemaVersion !== "number" ||
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    !Array.isArray(value.arcs)
  ) {
    throw new Error("올바른 StoryRail 프로젝트 데이터가 아닙니다.");
  }
}

function migrateV1ToV2(project: StoredProject): StoredProject {
  const settings = isRecord(project.settings) ? project.settings : {};
  return {
    ...project,
    schemaVersion: 2,
    foreshadows: Array.isArray(project.foreshadows) ? project.foreshadows : [],
    presets: Array.isArray(project.presets) ? project.presets : [],
    settings: { ...DEFAULT_SETTINGS, ...settings } as ProjectSettings,
    updatedAt:
      typeof project.updatedAt === "string"
        ? project.updatedAt
        : new Date().toISOString(),
  };
}

export function migrateProject(value: unknown): Project {
  assertProjectShape(value);
  let project = structuredClone(value);

  if (
    project.schemaVersion < 1 ||
    project.schemaVersion > CURRENT_SCHEMA_VERSION
  ) {
    throw new Error(`지원하지 않는 스키마 버전: ${project.schemaVersion}`);
  }
  if (project.schemaVersion === 1) project = migrateV1ToV2(project);

  return project as Project;
}
