import * as React from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Mention from "@tiptap/extension-mention";
import { RichTextToolbar } from "./RichTextToolbar";

export interface RichTextEditorProps {
  value?: string;
  onChange?: (html: string, plainText: string) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

export function RichTextEditor({
  value = "",
  onChange,
  placeholder = "Write something...",
  id,
  disabled = false,
  className,
}: RichTextEditorProps) {
  const onChangeRef = React.useRef(onChange);
  React.useLayoutEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        horizontalRule: false,
        codeBlock: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
      }),
      Mention.configure({
        HTMLAttributes: {
          class: "mention bg-[var(--pm-blue-bg)] text-[var(--pm-blue)] rounded px-1 py-0.5",
        },
        suggestion: {
          items: () => [],
        },
      }),
    ],
    content: value,
    editable: !disabled,
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        class:
          "prose prose-sm max-w-none min-h-[120px] px-3 py-2 focus:outline-none",
        role: "textbox",
        "aria-multiline": "true",
      },
    },
    onUpdate({ editor }) {
      const html = editor.getHTML();
      const plainText = editor.getText();
      onChangeRef.current?.(html, plainText);
    },
  });

  React.useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (editor.isFocused) return;
    const current = editor.getHTML();
    if (current !== value) {
      editor.commands.setContent(value, false);
    }
  }, [editor, value]);

  return (
    <div
      className={`rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] focus-within:shadow-[var(--pm-focus)] ${
        disabled ? "opacity-50" : ""
      } ${className ?? ""}`}
    >
      <RichTextToolbar editor={editor} />
      <EditorContent
        editor={editor}
        className="rounded-b-lg"
        placeholder={placeholder ?? ""}
        aria-placeholder={placeholder ?? ""}
      />
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {editor ? `${editor.getText().length} characters` : ""}
      </div>
    </div>
  );
}
