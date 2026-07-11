import { useEffect } from "react";
import Paragraph from "@tiptap/extension-paragraph";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Plugin } from "@tiptap/pm/state";
import { uid } from "./types";

interface WriterEditorProps {
  content: string;
  onChange: (html: string) => void;
  onParagraphSelect: (paragraphId: string | null) => void;
  focusParagraphId: string | null;
  paragraphTags: Record<string, string[]>;
}

const ParagraphWithId = Paragraph.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      paragraphId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-paragraph-id"),
        renderHTML: (attributes) =>
          attributes.paragraphId
            ? { "data-paragraph-id": attributes.paragraphId }
            : {},
      },
      guideTags: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-guide-tags"),
        renderHTML: (attributes) =>
          attributes.guideTags
            ? { "data-guide-tags": attributes.guideTags }
            : {},
      },
    };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (_transactions, _oldState, newState) => {
          let transaction = newState.tr;
          let changed = false;
          newState.doc.descendants((node, pos) => {
            if (node.type.name === "paragraph" && !node.attrs.paragraphId) {
              transaction = transaction.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                paragraphId: uid(),
              });
              changed = true;
            }
          });
          return changed ? transaction : null;
        },
      }),
    ];
  },
});

function selectedParagraphId(
  editor: NonNullable<ReturnType<typeof useEditor>>,
) {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === "paragraph")
      return node.attrs.paragraphId as string | null;
  }
  return null;
}

export default function WriterEditor({
  content,
  onChange,
  onParagraphSelect,
  focusParagraphId,
  paragraphTags,
}: WriterEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ paragraph: false }),
      ParagraphWithId,
      Placeholder.configure({ placeholder: "이 장면의 첫 문장을 시작하세요…" }),
    ],
    content,
    editorProps: {
      attributes: {
        class: "manuscript",
        spellcheck: "true",
        role: "textbox",
        "aria-label": "원고 편집기",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor: currentEditor }) => onChange(currentEditor.getHTML()),
    onSelectionUpdate: ({ editor: currentEditor }) => {
      onParagraphSelect(selectedParagraphId(currentEditor));
    },
  });

  useEffect(() => {
    if (editor && editor.getHTML() !== content) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content, editor]);

  useEffect(() => {
    if (!editor || !focusParagraphId) return;
    let targetPosition: number | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (
        node.type.name === "paragraph" &&
        node.attrs.paragraphId === focusParagraphId
      ) {
        targetPosition = pos + 1;
        return false;
      }
      return true;
    });
    if (targetPosition !== null) {
      editor
        .chain()
        .focus()
        .setTextSelection(targetPosition)
        .scrollIntoView()
        .run();
      const element = editor.view.dom.querySelector(
        `[data-paragraph-id="${CSS.escape(focusParagraphId)}"]`,
      );
      element?.classList.add("paragraph-flash");
      window.setTimeout(
        () => element?.classList.remove("paragraph-flash"),
        1600,
      );
    }
  }, [editor, focusParagraphId]);

  useEffect(() => {
    if (!editor) return;
    let transaction = editor.state.tr;
    let changed = false;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== "paragraph") return true;
      const tags = paragraphTags[node.attrs.paragraphId as string];
      const guideTags = tags?.length ? tags.join(" · ") : null;
      if (node.attrs.guideTags !== guideTags) {
        transaction = transaction.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          guideTags,
        });
        changed = true;
      }
      return true;
    });
    if (changed) editor.view.dispatch(transaction);
  }, [content, editor, paragraphTags]);

  return (
    <div
      className="editor-shell"
      onClick={(event) => {
        const paragraph = (event.target as HTMLElement).closest<HTMLElement>(
          "[data-paragraph-id]",
        );
        onParagraphSelect(
          paragraph?.dataset.paragraphId ??
            (editor ? selectedParagraphId(editor) : null),
        );
      }}
    >
      <EditorContent editor={editor} />
    </div>
  );
}
