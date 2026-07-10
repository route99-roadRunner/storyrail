import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Download,
  Eye,
  EyeOff,
  FilePlus2,
  FolderPlus,
  Import,
  Lightbulb,
  Menu,
  PanelLeftClose,
  PanelRightClose,
  Plus,
  Save,
  Settings,
  Sparkles,
  Target,
  Trash2,
  X,
} from "lucide-react";
import WriterEditor from "./WriterEditor";
import { loadLastProject, saveProject } from "./db";
import { completeActiveGuideStep } from "./domain";
import { exportEpisode, exportProject, htmlToText } from "./exporters";
import { instantiatePreset } from "./presets";
import { createEpisode, createSampleProject } from "./sample";
import type {
  Arc,
  Episode,
  Foreshadow,
  ForeshadowEvent,
  GuideStep,
  Id,
  Ingredient,
  ParagraphRef,
  Priority,
  Project,
  SaveStatus,
  Scene,
  Selection,
} from "./types";
import { uid } from "./types";

type RightTab = "plot" | "guide" | "ingredients" | "foreshadow" | "result";
type UndoSnapshot = { project: Project; selection: Selection; label: string };

function currentContext(project: Project, selection: Selection) {
  const arc =
    project.arcs.find((item) => item.id === selection.arcId) ?? project.arcs[0];
  const episode =
    arc?.episodes.find((item) => item.id === selection.episodeId) ??
    arc?.episodes[0];
  const scene =
    episode?.scenes.find((item) => item.id === selection.sceneId) ??
    episode?.scenes[0];
  return { arc, episode, scene };
}

function initialSelection(project: Project): Selection {
  const arc = project.arcs[0];
  const episode = arc.episodes[0];
  return {
    arcId: arc.id,
    episodeId: episode.id,
    sceneId: episode.scenes[0].id,
  };
}

function wordCount(episode: Episode) {
  return episode.scenes.reduce(
    (sum, scene) => sum + htmlToText(scene.content).replace(/\s/g, "").length,
    0,
  );
}

function moveItem<T>(items: T[], from: number, to: number) {
  const copy = [...items];
  const [item] = copy.splice(from, 1);
  copy.splice(Math.max(0, Math.min(to, copy.length)), 0, item);
  return copy;
}

export default function App() {
  const [project, setProject] = useState<Project | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("loading");
  const [rightTab, setRightTab] = useState<RightTab>("guide");
  const [paragraphId, setParagraphId] = useState<string | null>(null);
  const [focusParagraphId, setFocusParagraphId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<UndoSnapshot | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadLastProject()
      .then((stored) => {
        const loaded = stored ?? createSampleProject();
        setProject(loaded);
        setSelection(initialSelection(loaded));
        setSaveStatus(stored ? "saved" : "saving");
        setHydrated(true);
      })
      .catch(() => {
        const fallback = createSampleProject();
        setProject(fallback);
        setSelection(initialSelection(fallback));
        setSaveStatus("error");
        setHydrated(true);
      });
  }, []);

  useEffect(() => {
    if (!project || !hydrated) return;
    const timer = window.setTimeout(() => {
      saveProject({ ...project, updatedAt: new Date().toISOString() })
        .then(() => setSaveStatus("saved"))
        .catch(() => setSaveStatus("error"));
    }, 550);
    return () => window.clearTimeout(timer);
  }, [project, hydrated]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!undoSnapshot) return;
    const timer = window.setTimeout(() => setUndoSnapshot(null), 8000);
    return () => window.clearTimeout(timer);
  }, [undoSnapshot]);

  const context = useMemo(() => {
    if (!project || !selection) return null;
    return currentContext(project, selection);
  }, [project, selection]);

  const mutateProject = useCallback((recipe: (draft: Project) => Project) => {
    setSaveStatus("saving");
    setProject((value) => (value ? recipe(value) : value));
  }, []);

  const mutateEpisode = useCallback(
    (recipe: (episode: Episode) => Episode) => {
      if (!selection) return;
      mutateProject((value) => ({
        ...value,
        arcs: value.arcs.map((arc) =>
          arc.id !== selection.arcId
            ? arc
            : {
                ...arc,
                episodes: arc.episodes.map((episode) =>
                  episode.id === selection.episodeId
                    ? recipe(episode)
                    : episode,
                ),
              },
        ),
      }));
    },
    [mutateProject, selection],
  );

  const mutateScene = useCallback(
    (recipe: (scene: Scene) => Scene) => {
      if (!selection) return;
      mutateEpisode((episode) => ({
        ...episode,
        scenes: episode.scenes.map((scene) =>
          scene.id === selection.sceneId ? recipe(scene) : scene,
        ),
      }));
    },
    [mutateEpisode, selection],
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey && !event.shiftKey && event.key === "Enter") {
        event.preventDefault();
        completeCurrentStep();
      }
      if (event.ctrlKey && event.key.toLowerCase() === "j") {
        event.preventDefault();
        toggleSetting("rightPanelOpen");
      }
      if (event.ctrlKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (project) saveProject(project).then(() => setSaveStatus("saved"));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  if (
    !project ||
    !selection ||
    !context?.arc ||
    !context.episode ||
    !context.scene
  ) {
    return (
      <div className="loading-screen">
        <span className="spinner" />
        StoryRail을 여는 중…
      </div>
    );
  }

  const { arc, episode, scene } = context;
  const activeStep = episode.steps.find((step) => step.status === "active");
  const completedSteps = episode.steps.filter(
    (step) => step.status === "complete",
  ).length;
  const requiredLeft = episode.ingredients.filter(
    (item) => item.priority === "required" && item.status === "unused",
  );
  const orderedEpisodes = project.arcs
    .flatMap((item) => item.episodes)
    .sort((a, b) => a.number - b.number);
  const episodeIndex = orderedEpisodes.findIndex(
    (item) => item.id === episode.id,
  );
  const previousEpisode =
    episodeIndex > 0 ? orderedEpisodes[episodeIndex - 1] : undefined;
  const paragraphTags = episode.ingredients.reduce<Record<string, string[]>>(
    (tags, item) => {
      item.paragraphRefs
        .filter((ref) => ref.sceneId === scene.id)
        .forEach((ref) => {
          tags[ref.paragraphId] = [
            ...(tags[ref.paragraphId] ?? []),
            item.title || item.category,
          ];
        });
      return tags;
    },
    {},
  );

  function toggleSetting(key: keyof Project["settings"]) {
    mutateProject((value) => ({
      ...value,
      settings: { ...value.settings, [key]: !value.settings[key] },
    }));
  }

  function setPanelWidth(
    side: "left" | "right",
    start: number,
    event: React.PointerEvent,
  ) {
    event.preventDefault();
    const origin = event.clientX;
    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - origin;
      const width = side === "left" ? start + delta : start - delta;
      const clamped = Math.max(210, Math.min(width, 520));
      mutateProject((value) => ({
        ...value,
        settings: {
          ...value.settings,
          [side === "left" ? "leftPanelWidth" : "rightPanelWidth"]: clamped,
        },
      }));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function selectEpisode(targetArc: Arc, targetEpisode: Episode) {
    setSelection({
      arcId: targetArc.id,
      episodeId: targetEpisode.id,
      sceneId: targetEpisode.scenes[0].id,
    });
    setParagraphId(null);
  }

  function addArc() {
    const title = window.prompt(
      "새 아크 이름",
      `${project!.arcs.length + 1}부`,
    );
    if (!title?.trim()) return;
    const firstEpisode = createEpisode(1);
    const newArc: Arc = {
      id: uid(),
      title: title.trim(),
      goal: "",
      episodes: [firstEpisode],
    };
    mutateProject((value) => ({ ...value, arcs: [...value.arcs, newArc] }));
    setSelection({
      arcId: newArc.id,
      episodeId: firstEpisode.id,
      sceneId: firstEpisode.scenes[0].id,
    });
  }

  function addEpisode(targetArc: Arc) {
    const maxNumber = project!.arcs
      .flatMap((item) => item.episodes)
      .reduce((max, item) => Math.max(max, item.number), 0);
    const next = createEpisode(maxNumber + 1);
    mutateProject((value) => ({
      ...value,
      arcs: value.arcs.map((item) =>
        item.id === targetArc.id
          ? { ...item, episodes: [...item.episodes, next] }
          : item,
      ),
    }));
    setSelection({
      arcId: targetArc.id,
      episodeId: next.id,
      sceneId: next.scenes[0].id,
    });
  }

  function renameArc(targetArc: Arc) {
    const title = window.prompt("아크 이름", targetArc.title);
    if (!title?.trim()) return;
    mutateProject((value) => ({
      ...value,
      arcs: value.arcs.map((item) =>
        item.id === targetArc.id ? { ...item, title: title.trim() } : item,
      ),
    }));
  }

  function removeArc(targetArc: Arc) {
    if (
      project!.arcs.length === 1 ||
      !window.confirm(`‘${targetArc.title}’와 포함된 모든 회차를 삭제할까요?`)
    )
      return;
    setUndoSnapshot({
      project: project!,
      selection: selection!,
      label: `${targetArc.title} 삭제됨`,
    });
    const remaining = project!.arcs.filter((item) => item.id !== targetArc.id);
    mutateProject((value) => ({ ...value, arcs: remaining }));
    setSelection(initialSelection({ ...project!, arcs: remaining }));
  }

  function moveArc(index: number, direction: -1 | 1) {
    mutateProject((value) => ({
      ...value,
      arcs: moveItem(value.arcs, index, index + direction),
    }));
  }

  function renameEpisode(targetEpisode: Episode) {
    const title = window.prompt("회차 제목", targetEpisode.title);
    if (!title?.trim()) return;
    mutateProject((value) => ({
      ...value,
      arcs: value.arcs.map((item) => ({
        ...item,
        episodes: item.episodes.map((target) =>
          target.id === targetEpisode.id
            ? { ...target, title: title.trim() }
            : target,
        ),
      })),
    }));
  }

  function removeEpisode(targetArc: Arc, targetEpisode: Episode) {
    if (
      targetArc.episodes.length === 1 ||
      !window.confirm(`‘${targetEpisode.title}’와 원고를 삭제할까요?`)
    )
      return;
    setUndoSnapshot({
      project: project!,
      selection: selection!,
      label: `${targetEpisode.title} 삭제됨`,
    });
    const remaining = targetArc.episodes.filter(
      (item) => item.id !== targetEpisode.id,
    );
    mutateProject((value) => ({
      ...value,
      arcs: value.arcs.map((item) =>
        item.id === targetArc.id ? { ...item, episodes: remaining } : item,
      ),
    }));
    if (targetEpisode.id === episode.id) selectEpisode(targetArc, remaining[0]);
  }

  function moveEpisode(targetArc: Arc, index: number, direction: -1 | 1) {
    mutateProject((value) => ({
      ...value,
      arcs: value.arcs.map((item) =>
        item.id === targetArc.id
          ? {
              ...item,
              episodes: moveItem(item.episodes, index, index + direction),
            }
          : item,
      ),
    }));
  }

  function addScene() {
    const next: Scene = {
      id: uid(),
      title: `장면 ${episode.scenes.length + 1}`,
      purpose: "",
      content: "<p></p>",
    };
    mutateEpisode((value) => ({ ...value, scenes: [...value.scenes, next] }));
    setSelection({ ...selection!, sceneId: next.id });
  }

  function removeScene(target: Scene) {
    if (
      episode.scenes.length === 1 ||
      !window.confirm(`‘${target.title}’ 장면을 삭제할까요?`)
    )
      return;
    setUndoSnapshot({
      project: project!,
      selection: selection!,
      label: `${target.title} 삭제됨`,
    });
    const index = episode.scenes.findIndex((item) => item.id === target.id);
    const fallback = episode.scenes[Math.max(0, index - 1)];
    mutateEpisode((value) => ({
      ...value,
      scenes: value.scenes.filter((item) => item.id !== target.id),
    }));
    setSelection({ ...selection!, sceneId: fallback.id });
  }

  function completeCurrentStep() {
    mutateEpisode(completeActiveGuideStep);
  }

  function setStepStatus(stepId: Id, status: GuideStep["status"]) {
    mutateEpisode((value) => ({
      ...value,
      steps: value.steps.map((step) =>
        step.id === stepId ? { ...step, status } : step,
      ),
    }));
  }

  function activateStep(stepId: Id) {
    mutateEpisode((value) => ({
      ...value,
      steps: value.steps.map((step) => ({
        ...step,
        status:
          step.id === stepId
            ? "active"
            : step.status === "active"
              ? "pending"
              : step.status,
      })),
    }));
  }

  function addStep() {
    const step: GuideStep = {
      id: uid(),
      title: "새 구조 단계",
      instruction: "이 단계가 해야 할 서사적 역할을 적으세요.",
      status: episode.steps.some((item) => item.status === "active")
        ? "pending"
        : "active",
      paragraphRefs: [],
    };
    mutateEpisode((value) => ({ ...value, steps: [...value.steps, step] }));
  }

  function applyPreset(presetId: Id) {
    const preset = project!.presets.find((item) => item.id === presetId);
    if (
      !preset ||
      (episode.steps.length > 0 &&
        !window.confirm("현재 구조 단계를 프리셋으로 교체할까요?"))
    )
      return;
    mutateEpisode((value) => ({ ...value, steps: instantiatePreset(preset) }));
  }

  function addIngredient(category = "사건") {
    const ingredient: Ingredient = {
      id: uid(),
      category,
      title: "",
      description: "",
      priority: "recommended",
      status: "unused",
      paragraphRefs: [],
    };
    mutateEpisode((value) => ({
      ...value,
      ingredients: [...value.ingredients, ingredient],
    }));
  }

  function updateIngredient(id: Id, patch: Partial<Ingredient>) {
    mutateEpisode((value) => ({
      ...value,
      ingredients: value.ingredients.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    }));
  }

  function linkIngredient(item: Ingredient) {
    if (!paragraphId) {
      setNotice("먼저 원고에서 연결할 문단을 선택하세요.");
      return;
    }
    const reference = { sceneId: scene.id, paragraphId };
    if (
      item.paragraphRefs.some(
        (ref) =>
          ref.sceneId === reference.sceneId &&
          ref.paragraphId === reference.paragraphId,
      )
    )
      return;
    updateIngredient(item.id, {
      status: "used",
      paragraphRefs: [...item.paragraphRefs, reference],
    });
    setNotice("현재 문단에 재료를 연결했습니다.");
  }

  function unlinkIngredient(item: Ingredient, reference: ParagraphRef) {
    const paragraphRefs = item.paragraphRefs.filter(
      (ref) =>
        !(
          ref.sceneId === reference.sceneId &&
          ref.paragraphId === reference.paragraphId
        ),
    );
    updateIngredient(item.id, {
      paragraphRefs,
      status: paragraphRefs.length ? item.status : "unused",
    });
  }

  function moveIngredientToNext(item: Ingredient) {
    const nextEpisode = orderedEpisodes.find(
      (target) => target.number > episode.number,
    );
    if (!nextEpisode) {
      setNotice("이동할 다음 회차가 없습니다.");
      return;
    }
    const moved: Ingredient = {
      ...item,
      id: uid(),
      status: "unused",
      paragraphRefs: [],
      movedToEpisodeId: undefined,
    };
    mutateProject((value) => ({
      ...value,
      arcs: value.arcs.map((targetArc) => ({
        ...targetArc,
        episodes: targetArc.episodes.map((targetEpisode) =>
          targetEpisode.id === episode.id
            ? {
                ...targetEpisode,
                ingredients: targetEpisode.ingredients.map((target) =>
                  target.id === item.id
                    ? {
                        ...target,
                        status: "moved",
                        movedToEpisodeId: nextEpisode.id,
                      }
                    : target,
                ),
              }
            : targetEpisode.id === nextEpisode.id
              ? {
                  ...targetEpisode,
                  ingredients: [...targetEpisode.ingredients, moved],
                }
              : targetEpisode,
        ),
      })),
    }));
    setNotice(`${nextEpisode.title}로 재료를 이동했습니다.`);
  }

  function focusReference(reference: ParagraphRef) {
    const targetScene = episode.scenes.find(
      (item) => item.id === reference.sceneId,
    );
    if (!targetScene) return;
    setSelection({ ...selection!, sceneId: targetScene.id });
    setFocusParagraphId(null);
    window.setTimeout(() => setFocusParagraphId(reference.paragraphId), 0);
  }

  function addForeshadow() {
    const title = window.prompt("복선 이름");
    if (!title?.trim()) return;
    const item: Foreshadow = {
      id: uid(),
      title: title.trim(),
      truth: "",
      readerBelief: "",
      status: "planned",
      events: [],
    };
    mutateProject((value) => ({
      ...value,
      foreshadows: [...value.foreshadows, item],
    }));
  }

  function updateForeshadow(id: Id, patch: Partial<Foreshadow>) {
    mutateProject((value) => ({
      ...value,
      foreshadows: value.foreshadows.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    }));
  }

  function addForeshadowEvent(item: Foreshadow) {
    const event: ForeshadowEvent = {
      id: uid(),
      type: "remind",
      plannedEpisodeId: episode.id,
      paragraphRefs: [],
      status: "planned",
      note: "",
    };
    updateForeshadow(item.id, { events: [...item.events, event] });
  }

  function linkForeshadowEvent(item: Foreshadow, event: ForeshadowEvent) {
    if (!paragraphId) {
      setNotice("먼저 원고에서 연결할 문단을 선택하세요.");
      return;
    }
    const reference = { sceneId: scene.id, paragraphId };
    updateForeshadow(item.id, {
      status: item.status === "planned" ? "active" : item.status,
      events: item.events.map((target) =>
        target.id === event.id
          ? {
              ...target,
              actualEpisodeId: episode.id,
              status: "complete",
              paragraphRefs: [reference],
            }
          : target,
      ),
    });
  }

  function finishEpisode() {
    if (
      requiredLeft.length > 0 &&
      !window.confirm(
        `필수 재료 ${requiredLeft.length}개가 남았습니다. 그래도 회차를 완료할까요?`,
      )
    ) {
      setRightTab("ingredients");
      return;
    }
    mutateEpisode((value) => ({ ...value, status: "complete" }));
    setNotice("회차를 완료했습니다.");
  }

  async function importFromFile(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as Project;
      if (
        parsed.schemaVersion !== 1 ||
        !parsed.id ||
        !Array.isArray(parsed.arcs)
      )
        throw new Error("invalid");
      if (
        !window.confirm(
          "현재 작업을 가져온 프로젝트로 전환할까요? 기존 작업은 로컬에 보존됩니다.",
        )
      )
        return;
      await saveProject(parsed);
      setProject(parsed);
      setSelection(initialSelection(parsed));
      setNotice("프로젝트를 가져왔습니다.");
    } catch {
      setNotice("올바른 StoryRail 프로젝트 파일이 아닙니다.");
    }
  }

  const shellStyle = {
    "--left-width": `${project.settings.leftPanelWidth}px`,
    "--right-width": `${project.settings.rightPanelWidth}px`,
  } as React.CSSProperties;

  return (
    <div
      className={`app ${project.settings.focusMode ? "focus-mode" : ""}`}
      style={shellStyle}
    >
      <header className="titlebar">
        <div className="brand">
          <span className="brand-mark">
            <BookOpen size={17} />
          </span>
          StoryRail
        </div>
        <input
          className="project-title"
          value={project.title}
          aria-label="작품 제목"
          onChange={(event) =>
            mutateProject((value) => ({ ...value, title: event.target.value }))
          }
        />
        <div className={`save-state ${saveStatus}`} title="자동 저장 상태">
          {saveStatus === "saved" ? (
            <Check size={14} />
          ) : saveStatus === "error" ? (
            <X size={14} />
          ) : (
            <Save size={14} />
          )}
          {saveStatus === "saved"
            ? "저장됨"
            : saveStatus === "error"
              ? "저장 오류"
              : "저장 중"}
        </div>
        <div className="toolbar">
          <button
            className="icon-button"
            title="프로젝트 가져오기"
            onClick={() => importInput.current?.click()}
          >
            <Import size={16} />
          </button>
          <button
            className="icon-button"
            title="프로젝트 내보내기"
            onClick={() => exportProject(project)}
          >
            <Download size={16} />
          </button>
          <button
            className="icon-button"
            title="집중 모드"
            onClick={() => toggleSetting("focusMode")}
          >
            {project.settings.focusMode ? (
              <Eye size={16} />
            ) : (
              <EyeOff size={16} />
            )}
          </button>
          <input
            ref={importInput}
            type="file"
            accept=".json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importFromFile(file);
              event.target.value = "";
            }}
          />
        </div>
      </header>

      <main className="workspace">
        {project.settings.leftPanelOpen && !project.settings.focusMode && (
          <aside className="left-panel panel" aria-label="작품 탐색기">
            <PanelHeader
              title="작품 탐색기"
              action={
                <button
                  className="icon-button"
                  title="아크 추가"
                  onClick={addArc}
                >
                  <FolderPlus size={15} />
                </button>
              }
            />
            <div className="tree">
              {project.arcs.map((targetArc) => (
                <section className="tree-arc" key={targetArc.id}>
                  <div className="tree-row tree-arc-title">
                    <ChevronDown size={14} />{" "}
                    <span onDoubleClick={() => renameArc(targetArc)}>
                      {targetArc.title}
                    </span>
                    <div className="tree-tools">
                      <button
                        title="위로"
                        disabled={project.arcs.indexOf(targetArc) === 0}
                        onClick={() =>
                          moveArc(project.arcs.indexOf(targetArc), -1)
                        }
                      >
                        ↑
                      </button>
                      <button
                        title="아래로"
                        disabled={
                          project.arcs.indexOf(targetArc) ===
                          project.arcs.length - 1
                        }
                        onClick={() =>
                          moveArc(project.arcs.indexOf(targetArc), 1)
                        }
                      >
                        ↓
                      </button>
                      <button
                        title="회차 추가"
                        onClick={() => addEpisode(targetArc)}
                      >
                        <FilePlus2 size={14} />
                      </button>
                      <button
                        title="아크 삭제"
                        onClick={() => removeArc(targetArc)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  {targetArc.episodes.map(
                    (targetEpisode, targetEpisodeIndex) => (
                      <div key={targetEpisode.id}>
                        <div
                          className={`tree-row episode-row ${targetEpisode.id === episode.id ? "selected" : ""}`}
                          onDoubleClick={() => renameEpisode(targetEpisode)}
                        >
                          <button
                            className="episode-select"
                            onClick={() =>
                              selectEpisode(targetArc, targetEpisode)
                            }
                          >
                            <span
                              className={`status-dot ${targetEpisode.status}`}
                            />
                            <span className="episode-number">
                              {String(targetEpisode.number).padStart(3, "0")}
                            </span>
                            <span className="truncate">
                              {targetEpisode.title}
                            </span>
                          </button>
                          <div className="episode-tools">
                            <button
                              title="위로"
                              disabled={targetEpisodeIndex === 0}
                              onClick={() =>
                                moveEpisode(targetArc, targetEpisodeIndex, -1)
                              }
                            >
                              ↑
                            </button>
                            <button
                              title="아래로"
                              disabled={
                                targetEpisodeIndex ===
                                targetArc.episodes.length - 1
                              }
                              onClick={() =>
                                moveEpisode(targetArc, targetEpisodeIndex, 1)
                              }
                            >
                              ↓
                            </button>
                            <button
                              title="회차 삭제"
                              onClick={() =>
                                removeEpisode(targetArc, targetEpisode)
                              }
                            >
                              <X size={11} />
                            </button>
                          </div>
                        </div>
                        {targetEpisode.id === episode.id && (
                          <div className="scene-list">
                            {targetEpisode.scenes.map((targetScene) => (
                              <div
                                className={`scene-row ${targetScene.id === scene.id ? "selected" : ""}`}
                                key={targetScene.id}
                              >
                                <button
                                  onClick={() =>
                                    setSelection({
                                      ...selection,
                                      sceneId: targetScene.id,
                                    })
                                  }
                                >
                                  <ChevronRight size={12} />
                                  <span>{targetScene.title}</span>
                                </button>
                                <button
                                  className="scene-delete"
                                  title="장면 삭제"
                                  onClick={() => removeScene(targetScene)}
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ))}
                            <button className="tree-add" onClick={addScene}>
                              <Plus size={12} /> 장면 추가
                            </button>
                          </div>
                        )}
                      </div>
                    ),
                  )}
                </section>
              ))}
            </div>
            <div className="library-links">
              <button onClick={() => setRightTab("foreshadow")}>
                <Lightbulb size={15} />
                복선 원장 <span>{project.foreshadows.length}</span>
              </button>
              <button>
                <Settings size={15} />
                작품 설정
              </button>
            </div>
          </aside>
        )}

        {project.settings.leftPanelOpen && !project.settings.focusMode && (
          <div
            className="resizer"
            onPointerDown={(event) =>
              setPanelWidth("left", project.settings.leftPanelWidth, event)
            }
          />
        )}

        <section className="writing-area">
          <div className="document-header">
            <div>
              <input
                className="episode-title"
                value={episode.title}
                aria-label="회차 제목"
                onChange={(event) =>
                  mutateEpisode((value) => ({
                    ...value,
                    title: event.target.value,
                  }))
                }
              />
              <div className="breadcrumbs">
                {arc.title}
                <ChevronRight size={12} />
                <input
                  value={scene.title}
                  aria-label="장면 제목"
                  onChange={(event) =>
                    mutateScene((value) => ({
                      ...value,
                      title: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="document-actions">
              <span>{wordCount(episode).toLocaleString()}자</span>
              <button
                className="secondary-button"
                onClick={() =>
                  exportEpisode(
                    project.title,
                    episode.title,
                    episode.scenes,
                    "md",
                  )
                }
              >
                MD
              </button>
              <button
                className="secondary-button"
                onClick={() =>
                  exportEpisode(
                    project.title,
                    episode.title,
                    episode.scenes,
                    "txt",
                  )
                }
              >
                TXT
              </button>
              {!project.settings.leftPanelOpen &&
                !project.settings.focusMode && (
                  <button
                    className="icon-button"
                    onClick={() => toggleSetting("leftPanelOpen")}
                  >
                    <Menu size={16} />
                  </button>
                )}
            </div>
          </div>

          {activeStep && (
            <div className="guide-ribbon">
              <div>
                <span>현재 단계</span>
                <strong>{activeStep.title}</strong>
              </div>
              <p>{activeStep.instruction}</p>
              <button onClick={completeCurrentStep}>
                완료하고 다음 <ChevronRight size={15} />
              </button>
            </div>
          )}

          <WriterEditor
            key={scene.id}
            content={scene.content}
            onChange={(content) =>
              mutateScene((value) => ({ ...value, content }))
            }
            onParagraphSelect={setParagraphId}
            focusParagraphId={focusParagraphId}
            paragraphTags={paragraphTags}
          />

          <footer className="document-status">
            <span>{scene.title}</span>
            <span>문단 {paragraphId ? "선택됨" : "선택 안 됨"}</span>
            <span className="grow" />
            <span>
              단계 {Math.min(completedSteps + 1, episode.steps.length)}/
              {episode.steps.length}
            </span>
            <div className="mini-progress">
              <i
                style={{
                  width: `${episode.steps.length ? (completedSteps / episode.steps.length) * 100 : 0}%`,
                }}
              />
            </div>
          </footer>
        </section>

        {project.settings.rightPanelOpen && !project.settings.focusMode && (
          <div
            className="resizer"
            onPointerDown={(event) =>
              setPanelWidth("right", project.settings.rightPanelWidth, event)
            }
          />
        )}

        {project.settings.rightPanelOpen && !project.settings.focusMode && (
          <aside className="right-panel panel" aria-label="회차 내비게이터">
            <div className="right-heading">
              <div>
                <span>{String(episode.number).padStart(3, "0")}화</span>
                <strong>회차 내비게이터</strong>
              </div>
              <button
                className="icon-button"
                title="패널 닫기"
                onClick={() => toggleSetting("rightPanelOpen")}
              >
                <PanelRightClose size={16} />
              </button>
            </div>
            <nav className="tabs">
              {(
                [
                  ["plot", "플롯"],
                  ["guide", "진행"],
                  ["ingredients", "재료"],
                  ["foreshadow", "복선"],
                  ["result", "결과"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  className={rightTab === id ? "active" : ""}
                  onClick={() => setRightTab(id)}
                >
                  {label}
                </button>
              ))}
            </nav>
            <div className="right-content">
              {rightTab === "plot" && (
                <PlotPanel
                  episode={episode}
                  previousEpisode={previousEpisode}
                  mutateEpisode={mutateEpisode}
                />
              )}
              {rightTab === "guide" && (
                <GuidePanel
                  episode={episode}
                  presets={project.presets}
                  activeStep={activeStep}
                  onComplete={completeCurrentStep}
                  onActivate={activateStep}
                  onStatus={setStepStatus}
                  onAdd={addStep}
                  onApplyPreset={applyPreset}
                  onChange={(id, patch) =>
                    mutateEpisode((value) => ({
                      ...value,
                      steps: value.steps.map((item) =>
                        item.id === id ? { ...item, ...patch } : item,
                      ),
                    }))
                  }
                  onMove={(from, to) =>
                    mutateEpisode((value) => ({
                      ...value,
                      steps: moveItem(value.steps, from, to),
                    }))
                  }
                  onDelete={(id) =>
                    mutateEpisode((value) => ({
                      ...value,
                      steps: value.steps.filter((item) => item.id !== id),
                    }))
                  }
                />
              )}
              {rightTab === "ingredients" && (
                <IngredientPanel
                  ingredients={episode.ingredients}
                  paragraphSelected={Boolean(paragraphId)}
                  onAdd={addIngredient}
                  onUpdate={updateIngredient}
                  onLink={linkIngredient}
                  onFocus={focusReference}
                  onUnlink={unlinkIngredient}
                  onMoveNext={moveIngredientToNext}
                  onDelete={(id) =>
                    mutateEpisode((value) => ({
                      ...value,
                      ingredients: value.ingredients.filter(
                        (item) => item.id !== id,
                      ),
                    }))
                  }
                />
              )}
              {rightTab === "foreshadow" && (
                <ForeshadowPanel
                  items={project.foreshadows}
                  episodeId={episode.id}
                  episodeNumber={episode.number}
                  episodeNumbers={Object.fromEntries(
                    orderedEpisodes.map((item) => [item.id, item.number]),
                  )}
                  paragraphSelected={Boolean(paragraphId)}
                  onAdd={addForeshadow}
                  onUpdate={updateForeshadow}
                  onAddEvent={addForeshadowEvent}
                  onLinkEvent={linkForeshadowEvent}
                  onFocus={focusReference}
                />
              )}
              {rightTab === "result" && (
                <ResultPanel
                  episode={episode}
                  mutateEpisode={mutateEpisode}
                  requiredLeft={requiredLeft}
                  onFinish={finishEpisode}
                />
              )}
            </div>
          </aside>
        )}
      </main>

      {!project.settings.rightPanelOpen && !project.settings.focusMode && (
        <button
          className="right-open-button"
          onClick={() => toggleSetting("rightPanelOpen")}
        >
          <Target size={16} />
          가이드 열기
        </button>
      )}
      {!project.settings.leftPanelOpen && !project.settings.focusMode && (
        <button
          className="left-open-button"
          onClick={() => toggleSetting("leftPanelOpen")}
        >
          <PanelLeftClose size={16} />
        </button>
      )}
      {project.settings.focusMode && activeStep && (
        <div className="focus-hud">
          <span>{activeStep.title}</span>
          <p>{activeStep.instruction}</p>
          <button onClick={completeCurrentStep}>
            완료 <ChevronRight size={14} />
          </button>
        </div>
      )}
      {notice && <div className="toast">{notice}</div>}
      {undoSnapshot && (
        <div className="undo-toast">
          <span>{undoSnapshot.label}</span>
          <button
            onClick={() => {
              setProject(undoSnapshot.project);
              setSelection(undoSnapshot.selection);
              setSaveStatus("saving");
              setUndoSnapshot(null);
            }}
          >
            되돌리기
          </button>
        </div>
      )}
    </div>
  );
}

function PanelHeader({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="panel-header">
      <strong>{title}</strong>
      {action}
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  rows = 1,
  placeholder = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      {rows > 1 ? (
        <textarea
          rows={rows}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

function EditableList({
  title,
  items,
  onChange,
  placeholder,
}: {
  title: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
}) {
  return (
    <section className="panel-section">
      <div className="section-title">
        <span>{title}</span>
        <button onClick={() => onChange([...items, ""])}>
          <Plus size={14} />
        </button>
      </div>
      <div className="editable-list">
        {items.map((item, index) => (
          <div key={index}>
            <Circle size={9} />
            <input
              value={item}
              placeholder={placeholder}
              onChange={(event) =>
                onChange(
                  items.map((value, target) =>
                    target === index ? event.target.value : value,
                  ),
                )
              }
            />
            <button
              onClick={() =>
                onChange(items.filter((_, target) => target !== index))
              }
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function PlotPanel({
  episode,
  previousEpisode,
  mutateEpisode,
}: {
  episode: Episode;
  previousEpisode?: Episode;
  mutateEpisode: (recipe: (episode: Episode) => Episode) => void;
}) {
  return (
    <div className="panel-stack">
      {previousEpisode &&
        (previousEpisode.actualResult ||
          previousEpisode.continuityNotes.length > 0 ||
          previousEpisode.unresolvedQuestions.length > 0) && (
          <section className="continuity-card">
            <span>이전 회차에서 이어짐 · {previousEpisode.title}</span>
            {previousEpisode.actualResult && (
              <p>{previousEpisode.actualResult}</p>
            )}
            {previousEpisode.continuityNotes.map((note, index) => (
              <small key={`note-${index}`}>변화 · {note}</small>
            ))}
            {previousEpisode.unresolvedQuestions.map((question, index) => (
              <small key={`question-${index}`}>질문 · {question}</small>
            ))}
          </section>
        )}
      <FormField
        label="이번 회차 한 줄 목표"
        value={episode.synopsis}
        rows={3}
        placeholder="이번 화가 끝났을 때 무엇이 달라져야 하나요?"
        onChange={(synopsis) =>
          mutateEpisode((value) => ({ ...value, synopsis }))
        }
      />
      <div className="two-state">
        <FormField
          label="시작 상태"
          value={episode.startState}
          rows={3}
          onChange={(startState) =>
            mutateEpisode((value) => ({ ...value, startState }))
          }
        />
        <span>→</span>
        <FormField
          label="목표 종료 상태"
          value={episode.targetEndState}
          rows={3}
          onChange={(targetEndState) =>
            mutateEpisode((value) => ({ ...value, targetEndState }))
          }
        />
      </div>
      <EditableList
        title="반드시 일어날 사건"
        items={episode.requiredEvents}
        placeholder="사건을 입력하세요"
        onChange={(requiredEvents) =>
          mutateEpisode((value) => ({ ...value, requiredEvents }))
        }
      />
    </div>
  );
}

function GuidePanel({
  episode,
  presets,
  activeStep,
  onComplete,
  onActivate,
  onStatus,
  onAdd,
  onApplyPreset,
  onChange,
  onMove,
  onDelete,
}: {
  episode: Episode;
  presets: Project["presets"];
  activeStep?: GuideStep;
  onComplete: () => void;
  onActivate: (id: Id) => void;
  onStatus: (id: Id, status: GuideStep["status"]) => void;
  onAdd: () => void;
  onApplyPreset: (id: Id) => void;
  onChange: (id: Id, patch: Partial<GuideStep>) => void;
  onMove: (from: number, to: number) => void;
  onDelete: (id: Id) => void;
}) {
  return (
    <div className="panel-stack">
      <div className="preset-row">
        <select
          defaultValue=""
          onChange={(event) => {
            if (event.target.value) onApplyPreset(event.target.value);
            event.target.value = "";
          }}
        >
          <option value="">구조 프리셋 적용…</option>
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.title}
            </option>
          ))}
        </select>
        <button className="secondary-button" onClick={onAdd}>
          <Plus size={13} />
          단계
        </button>
      </div>
      {activeStep && (
        <section className="current-card">
          <span>지금 작성할 구조</span>
          <input
            value={activeStep.title}
            onChange={(event) =>
              onChange(activeStep.id, { title: event.target.value })
            }
          />
          <textarea
            rows={4}
            value={activeStep.instruction}
            onChange={(event) =>
              onChange(activeStep.id, { instruction: event.target.value })
            }
          />
          <button className="primary-button" onClick={onComplete}>
            <Check size={15} />
            완료하고 다음
          </button>
        </section>
      )}
      <div className="step-list">
        {episode.steps.map((step, index) => (
          <div className={`step-item ${step.status}`} key={step.id}>
            <button
              className="step-state"
              title="현재 단계로 설정"
              onClick={() => onActivate(step.id)}
            >
              {step.status === "complete" ? (
                <Check size={13} />
              ) : step.status === "skipped" ? (
                <MinusIcon />
              ) : (
                <span>{index + 1}</span>
              )}
            </button>
            <div className="step-copy">
              <input
                value={step.title}
                onChange={(event) =>
                  onChange(step.id, { title: event.target.value })
                }
              />
              <small>{step.instruction}</small>
            </div>
            <div className="item-menu">
              <button
                disabled={index === 0}
                title="위로"
                onClick={() => onMove(index, index - 1)}
              >
                ↑
              </button>
              <button
                disabled={index === episode.steps.length - 1}
                title="아래로"
                onClick={() => onMove(index, index + 1)}
              >
                ↓
              </button>
              <button
                title="건너뛰기"
                onClick={() =>
                  onStatus(
                    step.id,
                    step.status === "skipped" ? "pending" : "skipped",
                  )
                }
              >
                –
              </button>
              <button title="삭제" onClick={() => onDelete(step.id)}>
                <X size={11} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MinusIcon() {
  return <span aria-label="건너뜀">–</span>;
}

const CATEGORIES = [
  "사건",
  "정보",
  "복선",
  "감정",
  "관계",
  "개그",
  "대화",
  "고구마",
  "사이다",
  "보상",
  "기타",
];

function IngredientPanel({
  ingredients,
  paragraphSelected,
  onAdd,
  onUpdate,
  onLink,
  onFocus,
  onUnlink,
  onMoveNext,
  onDelete,
}: {
  ingredients: Ingredient[];
  paragraphSelected: boolean;
  onAdd: (category?: string) => void;
  onUpdate: (id: Id, patch: Partial<Ingredient>) => void;
  onLink: (item: Ingredient) => void;
  onFocus: (ref: ParagraphRef) => void;
  onUnlink: (item: Ingredient, ref: ParagraphRef) => void;
  onMoveNext: (item: Ingredient) => void;
  onDelete: (id: Id) => void;
}) {
  return (
    <div className="panel-stack">
      <div className="quick-add">
        <span>빠른 추가</span>
        <div>
          {["복선", "개그", "대화", "고구마", "사이다", "보상"].map(
            (category) => (
              <button key={category} onClick={() => onAdd(category)}>
                + {category}
              </button>
            ),
          )}
        </div>
      </div>
      <div className={`selection-hint ${paragraphSelected ? "ready" : ""}`}>
        {paragraphSelected
          ? "선택한 문단에 재료를 연결할 수 있습니다."
          : "원고 문단을 선택하면 위치를 연결할 수 있습니다."}
      </div>
      <div className="ingredient-list">
        {ingredients.map((item) => (
          <article className={`ingredient-card ${item.status}`} key={item.id}>
            <div className="ingredient-top">
              <select
                value={item.category}
                onChange={(event) =>
                  onUpdate(item.id, { category: event.target.value })
                }
              >
                {CATEGORIES.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
              <select
                value={item.priority}
                onChange={(event) =>
                  onUpdate(item.id, {
                    priority: event.target.value as Priority,
                  })
                }
              >
                <option value="required">필수</option>
                <option value="recommended">권장</option>
                <option value="optional">선택</option>
              </select>
              <button onClick={() => onDelete(item.id)}>
                <Trash2 size={13} />
              </button>
            </div>
            <input
              className="ingredient-title"
              value={item.title}
              placeholder={`${item.category} 내용을 입력하세요`}
              onChange={(event) =>
                onUpdate(item.id, { title: event.target.value })
              }
            />
            <textarea
              rows={2}
              value={item.description}
              placeholder="의도나 조건을 메모하세요"
              onChange={(event) =>
                onUpdate(item.id, { description: event.target.value })
              }
            />
            <div className="ingredient-actions">
              <select
                value={item.status}
                onChange={(event) =>
                  onUpdate(item.id, {
                    status: event.target.value as Ingredient["status"],
                  })
                }
              >
                <option value="unused">미사용</option>
                <option value="used">사용</option>
                <option value="moved">다음 화로</option>
                <option value="excluded">제외</option>
              </select>
              <button className="link-button" onClick={() => onLink(item)}>
                문단 연결
              </button>
              <button className="link-button" onClick={() => onMoveNext(item)}>
                다음 화로
              </button>
            </div>
            {item.paragraphRefs.length > 0 && (
              <div className="reference-chips">
                {item.paragraphRefs.map((ref, index) => (
                  <span key={`${ref.paragraphId}-${index}`}>
                    <button onClick={() => onFocus(ref)}>
                      문단 {index + 1}
                    </button>
                    <button
                      title="연결 해제"
                      onClick={() => onUnlink(item, ref)}
                    >
                      <X size={9} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
      <button className="dashed-button" onClick={() => onAdd()}>
        <Plus size={14} />
        재료 직접 추가
      </button>
    </div>
  );
}

function ForeshadowPanel({
  items,
  episodeId,
  episodeNumber,
  episodeNumbers,
  paragraphSelected,
  onAdd,
  onUpdate,
  onAddEvent,
  onLinkEvent,
  onFocus,
}: {
  items: Foreshadow[];
  episodeId: Id;
  episodeNumber: number;
  episodeNumbers: Record<Id, number>;
  paragraphSelected: boolean;
  onAdd: () => void;
  onUpdate: (id: Id, patch: Partial<Foreshadow>) => void;
  onAddEvent: (item: Foreshadow) => void;
  onLinkEvent: (item: Foreshadow, event: ForeshadowEvent) => void;
  onFocus: (ref: ParagraphRef) => void;
}) {
  const labels = {
    plant: "심기",
    remind: "환기",
    misdirect: "왜곡",
    resolve: "회수",
  };
  return (
    <div className="panel-stack">
      <div className={`selection-hint ${paragraphSelected ? "ready" : ""}`}>
        {paragraphSelected
          ? "선택 문단에 복선 이벤트를 배치할 수 있습니다."
          : "원고 문단을 먼저 선택하세요."}
      </div>
      {items.map((item) => (
        <article className="foreshadow-card" key={item.id}>
          <div className="foreshadow-title">
            <Lightbulb size={15} />
            <input
              value={item.title}
              onChange={(event) =>
                onUpdate(item.id, { title: event.target.value })
              }
            />
            <select
              value={item.status}
              onChange={(event) =>
                onUpdate(item.id, {
                  status: event.target.value as Foreshadow["status"],
                })
              }
            >
              <option value="planned">계획</option>
              <option value="active">활성</option>
              <option value="ready">회수 준비</option>
              <option value="resolved">회수</option>
              <option value="discarded">폐기</option>
            </select>
          </div>
          <FormField
            label="실제 의미"
            value={item.truth}
            onChange={(truth) => onUpdate(item.id, { truth })}
          />
          <FormField
            label="독자의 현재 인식"
            value={item.readerBelief}
            onChange={(readerBelief) => onUpdate(item.id, { readerBelief })}
          />
          <div className="event-list">
            {item.events.map((event) => {
              const overdue =
                event.status === "planned" &&
                (episodeNumbers[event.plannedEpisodeId] ?? Infinity) <
                  episodeNumber;
              return (
                <div
                  className={`event-row ${event.status} ${overdue ? "overdue" : ""}`}
                  key={event.id}
                >
                  <select
                    value={event.type}
                    onChange={(changeEvent) =>
                      onUpdate(item.id, {
                        events: item.events.map((target) =>
                          target.id === event.id
                            ? {
                                ...target,
                                type: changeEvent.target
                                  .value as ForeshadowEvent["type"],
                              }
                            : target,
                        ),
                      })
                    }
                  >
                    {Object.entries(labels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <span>
                    {overdue
                      ? "기한 지남"
                      : event.plannedEpisodeId === episodeId
                        ? "이번 화"
                        : `${episodeNumbers[event.plannedEpisodeId] ?? "?"}화 예정`}
                  </span>
                  {event.paragraphRefs.length ? (
                    <button onClick={() => onFocus(event.paragraphRefs[0])}>
                      문단 보기
                    </button>
                  ) : event.plannedEpisodeId === episodeId || overdue ? (
                    <button onClick={() => onLinkEvent(item, event)}>
                      현재 문단 배치
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              );
            })}
          </div>
          <button className="text-button" onClick={() => onAddEvent(item)}>
            <Plus size={12} />
            이번 화 이벤트
          </button>
        </article>
      ))}
      <button className="dashed-button" onClick={onAdd}>
        <Plus size={14} />
        복선 추가
      </button>
    </div>
  );
}

function ResultPanel({
  episode,
  mutateEpisode,
  requiredLeft,
  onFinish,
}: {
  episode: Episode;
  mutateEpisode: (recipe: (episode: Episode) => Episode) => void;
  requiredLeft: Ingredient[];
  onFinish: () => void;
}) {
  return (
    <div className="panel-stack">
      <div className={`completion-banner ${episode.status}`}>
        <Sparkles size={18} />
        <div>
          <strong>
            {episode.status === "complete" ? "완료된 회차" : "회차 마감 점검"}
          </strong>
          <span>
            {requiredLeft.length
              ? `필수 재료 ${requiredLeft.length}개가 남았습니다.`
              : "필수 재료를 모두 처리했습니다."}
          </span>
        </div>
      </div>
      <FormField
        label="실제 회차 결과"
        value={episode.actualResult}
        rows={5}
        placeholder="계획과 달라진 실제 결과를 기록하세요"
        onChange={(actualResult) =>
          mutateEpisode((value) => ({ ...value, actualResult }))
        }
      />
      <EditableList
        title="인물·설정 변화"
        items={episode.continuityNotes}
        placeholder="다음 화에도 유지할 변화"
        onChange={(continuityNotes) =>
          mutateEpisode((value) => ({ ...value, continuityNotes }))
        }
      />
      <EditableList
        title="미해결 질문"
        items={episode.unresolvedQuestions}
        placeholder="독자가 아직 답을 모르는 질문"
        onChange={(unresolvedQuestions) =>
          mutateEpisode((value) => ({ ...value, unresolvedQuestions }))
        }
      />
      <button className="primary-button finish-button" onClick={onFinish}>
        <Check size={16} />
        {episode.status === "complete" ? "완료 상태 다시 확인" : "회차 완료"}
      </button>
    </div>
  );
}
