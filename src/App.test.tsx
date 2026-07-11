import { describe, expect, it } from "vitest";
import {
  createEmptyProject,
  createEpisode,
  createSampleProject,
} from "./sample";
import { DEFAULT_PRESETS, instantiatePreset } from "./presets";
import { completeActiveGuideStep } from "./domain";
import { migrateProject } from "./migrations";

describe("StoryRail domain defaults", () => {
  it("starts a new user with an empty project", () => {
    const project = createEmptyProject();
    expect(project.arcs).toEqual([]);
    expect(project.title).toBe("제목 없는 작품");
  });

  it("creates a project with an editable first scene", () => {
    const project = createSampleProject();
    expect(project.schemaVersion).toBe(2);
    expect(project.arcs[0].episodes[0].scenes).toHaveLength(1);
  });

  it("copies presets into independent guide steps", () => {
    const first = instantiatePreset(DEFAULT_PRESETS[0]);
    const second = instantiatePreset(DEFAULT_PRESETS[0]);
    expect(first[0].status).toBe("active");
    expect(first[0].id).not.toBe(second[0].id);
  });

  it("numbers newly created episodes", () => {
    expect(createEpisode(12).title).toBe("12화");
  });

  it("completes the active guide step and activates the next one", () => {
    const episode = createEpisode(1);
    const next = completeActiveGuideStep(episode);
    expect(next.status).toBe("writing");
    expect(next.steps[0].status).toBe("complete");
    expect(next.steps[1].status).toBe("active");
    expect(episode.steps[0].status).toBe("active");
  });
  it("migrates version 1 projects and fills missing settings", () => {
    const legacy = createSampleProject() as unknown as Record<string, unknown>;
    legacy.schemaVersion = 1;
    legacy.settings = { leftPanelWidth: 320 };

    const migrated = migrateProject(legacy);

    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.settings.leftPanelWidth).toBe(320);
    expect(migrated.settings.rightPanelOpen).toBe(true);
    expect(legacy.schemaVersion).toBe(1);
  });

  it("rejects project data from a newer schema", () => {
    const future = { ...createSampleProject(), schemaVersion: 999 };
    expect(() => migrateProject(future)).toThrow("지원하지 않는 스키마 버전");
  });
});
