import type { Project } from "./types";

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportProject(project: Project) {
  download(
    `${safeName(project.title)}.storyrail.json`,
    JSON.stringify(project, null, 2),
    "application/json;charset=utf-8",
  );
}

export function htmlToText(html: string) {
  const document = new DOMParser().parseFromString(html, "text/html");
  return document.body.innerText.trim();
}

export function exportEpisode(
  projectTitle: string,
  episodeTitle: string,
  scenes: Array<{ title: string; content: string }>,
  format: "md" | "txt",
) {
  const sections = scenes.map((scene) => {
    const text = htmlToText(scene.content);
    return format === "md"
      ? `## ${scene.title}\n\n${text}`
      : `${scene.title}\n\n${text}`;
  });
  const heading = format === "md" ? `# ${episodeTitle}` : episodeTitle;
  download(
    `${safeName(projectTitle)}_${safeName(episodeTitle)}.${format}`,
    `${heading}\n\n${sections.join("\n\n")}\n`,
    "text/plain;charset=utf-8",
  );
}

function safeName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").trim() || "storyrail";
}
