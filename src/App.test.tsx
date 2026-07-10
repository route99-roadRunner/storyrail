import { describe, expect, it } from "vitest";
import { createEpisode, createSampleProject } from "./sample";
import { DEFAULT_PRESETS, instantiatePreset } from "./presets";
import { completeActiveGuideStep } from "./domain";

describe("StoryRail domain defaults", () => {
  it("creates a project with an editable first scene", () => {
    const project = createSampleProject();
    expect(project.schemaVersion).toBe(1);
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
});
