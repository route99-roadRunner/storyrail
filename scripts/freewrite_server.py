"""
Freewrite Mode MCP Server for Novel Studio.

3개의 도구를 제공:
  - start_freewrite: 기획 없이 자유 집필 시작
  - continuity_sync: 챕터 완성/수정 후 연속성 트래커 갱신
  - retroactive_planning: 기 집필 챕터에서 기획서 역추출
"""

import sys
import json
from datetime import date
from pathlib import Path

from pydantic import BaseModel, Field
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("FreewriteServer")

# 프로젝트 루트 (scripts/ 상위)
PROJECT_ROOT = Path(__file__).resolve().parent.parent


# ── Pydantic 모델 ──────────────────────────────────────────

class FreewriteRequest(BaseModel):
    project_name: str = Field(..., description="프로젝트 이름 (예: ts_hunter_001)")
    concept: str = Field(..., description="소설 콘셉트 1-2줄")
    genre: str = Field(..., description="장르 (예: 현대 판타지, 로맨스)")
    tone: str = Field(..., description="톤 (예: 유머러스, 어두운, 긴장감)")
    pov: str = Field(..., description="시점 (예: 1인칭, 3인칭 제한)")
    language: str = Field("ko", description="언어 코드 (ko 또는 en)")
    chapter_number: int = Field(1, description="집필할 챕터 번호", ge=1)


class ContinuitySyncRequest(BaseModel):
    project_name: str = Field(..., description="프로젝트 이름")
    language: str = Field("ko", description="언어 코드")
    chapter_number: int = Field(..., description="동기화할 챕터 번호", ge=1)
    is_revision: bool = Field(
        False,
        description="True: 보조작가가 수정한 기존 챕터 반영 / False: 새 챕터 추가",
    )


class RetroactivePlanningRequest(BaseModel):
    project_name: str = Field(..., description="프로젝트 이름")
    language: str = Field("ko", description="언어 코드")
    chapters_to_analyze: list[int] | None = Field(
        None,
        description="분석할 챕터 번호 목록 (None이면 전체)",
    )


# ── 헬퍼 ───────────────────────────────────────────────────

def _project_path(language: str, project_name: str) -> Path:
    return PROJECT_ROOT / "projects" / language / project_name


def _chapter_path(proj: Path, chapter_number: int) -> Path:
    return proj / "phase2_chapters" / f"chapter_{chapter_number:02d}.md"


def _tracker_path(proj: Path) -> Path:
    return proj / "notes" / "continuity_tracker.md"


def _find_chapters(proj: Path) -> list[Path]:
    """phase2_chapters/ 에서 chapter_*.md 파일 목록을 정렬하여 반환."""
    ch_dir = proj / "phase2_chapters"
    if not ch_dir.exists():
        return []
    return sorted(ch_dir.glob("chapter_*.md"))


def _ensure_dirs(proj: Path) -> list[str]:
    """필요한 디렉토리를 생성하고, 새로 만든 경로 목록을 반환."""
    created = []
    for sub in ["phase2_chapters", "notes"]:
        d = proj / sub
        if not d.exists():
            d.mkdir(parents=True, exist_ok=True)
            created.append(str(d))
    return created


# ── Tool 1: start_freewrite ────────────────────────────────

@mcp.tool(
    name="start_freewrite",
    description="기획(Phase 1) 없이 자유 집필을 시작합니다. 콘셉트/장르/톤/시점만으로 바로 집필합니다.",
)
def start_freewrite(request: FreewriteRequest) -> str:
    proj = _project_path(request.language, request.project_name)
    created = _ensure_dirs(proj)
    tracker = _tracker_path(proj)
    tracker_exists = tracker.exists()
    ch_num = request.chapter_number
    chapter_file = _chapter_path(proj, ch_num)
    lang_prefix = "ko-" if request.language == "ko" else ""

    if created:
        print(f"[freewrite] 디렉토리 생성: {created}", file=sys.stderr)

    continuity_block = ""
    if ch_num > 1:
        if tracker_exists:
            continuity_block = f"""
3. `{tracker}` 파일을 읽고 이전 챕터의 연속성을 유지하세요.
   - 등장 캐릭터 상태, 타임라인, 미회수 떡밥, 마지막 장면을 확인하세요.
   - 이전 챕터와 모순되는 내용을 쓰지 마세요."""
        else:
            continuity_block = f"""
3. **주의**: continuity_tracker.md가 아직 없습니다.
   - 이전 챕터 파일을 직접 읽어서 연속성을 확인하세요.
   - 집필 완료 후 반드시 이전 챕터들도 `continuity_sync`로 동기화하세요."""
    else:
        continuity_block = """
3. 첫 챕터입니다. 위 콘셉트를 바탕으로 자유롭게 시작하세요."""

    return f"""[FREEWRITE MODE 활성화]

프로젝트: {proj}
챕터: {ch_num}화
모드: 자유 집필 (Phase 1 생략)

## 콘셉트
{request.concept}

## 장르/톤/시점
- 장르: {request.genre}
- 톤: {request.tone}
- 시점: {request.pov}

## 집필 지시
1. `.github/agents/{lang_prefix}prose-writer.agent.md`를 읽고 Prose Writer 역할을 수행하세요.
2. 챕터 파일 경로: `{chapter_file}`{continuity_block}
4. 기획서 없이 자유롭게 집필하되, 위 콘셉트/장르/톤/시점을 준수하세요.
5. 집필 완료 후 사용자에게 `continuity_sync` 도구 사용을 안내하세요.

## Freewrite 모드 제약
- phase1_planning 문서를 참조하지 마세요 (존재하지 않거나 역추출 전입니다).
- META/REFERENCE 태깅은 사용하지 마세요.
- 캐릭터와 설정은 자유롭게 만들되, continuity_tracker와 모순되지 않아야 합니다.
- 소설 본문은 대화에 출력하지 않고 파일에 저장합니다."""


# ── Tool 2: continuity_sync ────────────────────────────────

@mcp.tool(
    name="continuity_sync",
    description="챕터 집필/수정 후 연속성 트래커를 갱신합니다. 보조작가 윤문 후에도 사용합니다.",
)
def continuity_sync(request: ContinuitySyncRequest) -> str:
    proj = _project_path(request.language, request.project_name)
    ch_file = _chapter_path(proj, request.chapter_number)
    tracker = _tracker_path(proj)
    tracker_exists = tracker.exists()
    ch_num = request.chapter_number

    # notes/ 디렉토리 확인
    notes_dir = proj / "notes"
    if not notes_dir.exists():
        notes_dir.mkdir(parents=True, exist_ok=True)
        print(f"[continuity_sync] notes/ 디렉토리 생성: {notes_dir}", file=sys.stderr)

    if not ch_file.exists():
        return f"[ERROR] 챕터 파일이 존재하지 않습니다: {ch_file}"

    mode_label = "수정본 반영 (기존 섹션 교체)" if request.is_revision else "신규 챕터 추가"
    tracker_label = "기존 트래커 업데이트" if tracker_exists else "트래커 신규 생성"
    today = date.today().isoformat()

    revision_instruction = ""
    if request.is_revision:
        revision_instruction = f"""
### 수정본 반영 절차
1. 기존 `continuity_tracker.md`에서 `## Chapter {ch_num:02d}:` 섹션을 찾으세요.
2. 해당 섹션 전체를 새로 추출한 내용으로 교체하세요.
3. 교체 후 후속 챕터의 연속성에 영향이 있는지 확인하고, 변경된 사항을 요약에 포함하세요."""
    else:
        revision_instruction = f"""
### 신규 추가 절차
1. `continuity_tracker.md` 끝에 Chapter {ch_num:02d} 섹션을 추가하세요.
2. 이전 챕터의 미회수 떡밥 중 이번 챕터에서 회수된 것이 있으면 체크박스를 [x]로 변경하세요."""

    return f"""[CONTINUITY SYNC 실행]

## 대상
- 챕터 파일: `{ch_file}`
- 트래커 파일: `{tracker}`
- 모드: {mode_label} / {tracker_label}

## 지시
1. 챕터 파일 `{ch_file}`을 읽으세요.
2. 아래 항목을 추출하세요:
   - **등장 캐릭터**: 이름, 현재 상태(감정/위치), 알게 된 정보, 관계 변화
   - **타임라인**: 시작 시점, 종료 시점, 경과 시간
   - **장소/설정**: 새로 등장한 장소나 세계관 규칙
   - **핵심 이벤트**: 주요 사건 목록
   - **미회수 떡밥**: 복선, 미해결 질문, 떡밥 (설치된 챕터 명시)
   - **마지막 장면**: 마지막 장면 2-3줄 요약 (위치, 감정 상태, 다음 챕터 연결점)
{revision_instruction}

## continuity_tracker.md 형식

아래 형식을 정확히 따르세요. 기존 내용이 있으면 헤더와 이전 챕터 섹션은 유지합니다.

```markdown
# Continuity Tracker: {request.project_name}
마지막 업데이트: {today}

---

## Chapter {ch_num:02d}: [챕터 제목]

### 등장 캐릭터
| 캐릭터 | 상태 | 알게 된 정보 | 관계 변화 |
|--------|------|-------------|----------|
| [이름] | [감정/위치/상태] | [새로 알게 된 것] | [관계 변화] |

### 타임라인
- 시작: [시점]
- 종료: [시점]
- 경과: [시간]

### 장소/설정
- [장소]: [설명 또는 새 규칙]

### 핵심 이벤트
1. [이벤트]
2. [이벤트]

### 미회수 떡밥
- [ ] [떡밥 내용] (설치: Ch{{XX}})
- [x] [회수된 떡밥] (설치: Ch{{XX}}, 회수: Ch{{YY}})

### 마지막 장면
[2-3줄 요약: 위치, 감정 상태, 다음 연결점]

---
```

## 완료 후
- 변경 내용을 2-3줄로 요약 보고하세요.
- Edit 도구를 사용하여 기존 파일을 수정하거나, Write 도구로 신규 생성하세요."""


# ── Tool 3: retroactive_planning ───────────────────────────

@mcp.tool(
    name="retroactive_planning",
    description="기 집필된 챕터에서 기획서(캐릭터 프로필, 플롯 구조, 세계관 설정)를 역추출합니다.",
)
def retroactive_planning(request: RetroactivePlanningRequest) -> str:
    proj = _project_path(request.language, request.project_name)
    chapters = _find_chapters(proj)
    tracker = _tracker_path(proj)
    tracker_exists = tracker.exists()
    lang_prefix = "ko-" if request.language == "ko" else ""

    if not chapters:
        return f"[ERROR] 챕터 파일이 없습니다: {proj / 'phase2_chapters'}"

    # 분석 대상 필터링
    if request.chapters_to_analyze:
        target_nums = set(request.chapters_to_analyze)
        chapters = [c for c in chapters if _extract_chapter_num(c) in target_nums]

    chapter_list = "\n".join(f"   - `{c}`" for c in chapters)
    tracker_line = f"   - `{tracker}` (보조 입력)" if tracker_exists else "   - continuity_tracker 없음"

    # phase1 기존 파일 확인
    planning_dir = proj / "phase1_planning"
    existing_plans = list(planning_dir.glob("*.md")) if planning_dir.exists() else []
    overwrite_warning = ""
    if existing_plans:
        existing_list = ", ".join(f.name for f in existing_plans)
        overwrite_warning = f"""
> **주의**: phase1_planning/에 기존 파일이 있습니다: {existing_list}
> 역추출 결과로 덮어쓰게 됩니다. 기존 파일 백업이 필요하면 사용자에게 확인하세요."""

    return f"""[RETROACTIVE PLANNING 실행]

## 대상
- 프로젝트: `{proj}`
- 분석 챕터:
{chapter_list}
- 보조 입력:
{tracker_line}
- 출력 위치: `{planning_dir}/`
{overwrite_warning}

## 지시

### 1단계: 챕터 읽기
아래 파일들을 순서대로 읽으세요:
{chapter_list}
{"그리고 `" + str(tracker) + "`도 참조하세요." if tracker_exists else ""}

### 2단계: 기획 문서 역추출

다음 4개 파일을 `{planning_dir}/`에 생성하세요.
모든 파일 상단에 아래 표기를 추가하세요:
```
> [retroactive] 이 문서는 기 집필된 챕터에서 역추출되었습니다. ({date.today().isoformat()})
```

#### 2a. `integrated_plan.md` (통합 기획서)
- `.github/agents/{lang_prefix}main-writer.agent.md`의 Phase 1 통합 출력 형식을 따르세요.
- 스토리 요약, 주인공 목록, 챕터 구조, 핵심 배경, 창작 시 주의사항 포함.

#### 2b. `character_profiles.md` (캐릭터 프로필)
- `.github/agents/{lang_prefix}character-writer.agent.md`를 읽고 해당 형식을 따르세요.
- 등장한 모든 캐릭터의 프로필 작성.
- META/REFERENCE 태깅: 챕터에서 아직 독자에게 드러나지 않은 정보는 META로, 이미 노출된 정보는 REFERENCE로.

#### 2c. `story_structure.md` (플롯 구조)
- `.github/agents/{lang_prefix}story-writer.agent.md`를 읽고 해당 형식을 따르세요.
- 기 집필 챕터의 구조를 [확정]으로 정리.
- 향후 전개 방향을 [추정]으로 구분하여 추가.

#### 2d. `setting_world.md` (세계관 설정)
- `.github/agents/{lang_prefix}setting-writer.agent.md`를 읽고 해당 형식을 따르세요.
- 챕터에서 등장한 세계관 요소만 정리.

### 3단계: 보고
- 각 파일 생성 완료 후 요약 보고하세요.
- 생성된 파일 목록과 주요 내용을 2-3줄로.

## 핵심 원칙
- **역추출이지 상상이 아닙니다.** 챕터에 없는 정보를 창작하지 마세요.
- 향후 방향 [추정] 섹션만 예외적으로 추론을 허용합니다.
- 소설 본문을 대화에 출력하지 마세요. 파일에만 저장합니다."""


def _extract_chapter_num(path: Path) -> int:
    """chapter_01.md → 1"""
    stem = path.stem  # "chapter_01"
    parts = stem.split("_")
    for part in reversed(parts):
        if part.isdigit():
            return int(part)
    return 0


# ── 서버 실행 ──────────────────────────────────────────────

if __name__ == "__main__":
    print("[freewrite] MCP 서버 시작", file=sys.stderr)
    mcp.run(transport="stdio")
