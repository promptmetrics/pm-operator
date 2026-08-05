import * as React from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor as TipTapEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Mention from "@tiptap/extension-mention";
import Image from "@tiptap/extension-image";
import Youtube from "@tiptap/extension-youtube";
import Placeholder from "@tiptap/extension-placeholder";
import { RichTextToolbar } from "./RichTextToolbar";

export interface RichTextEditorProps {
  value?: string;
  onChange?: (html: string, plainText: string) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  /** Extra classes applied to the editable content area (the ProseMirror wrapper). */
  contentClassName?: string;
  /** Called when the user drops, pastes, or selects an image. Handler should upload the file and insert it. */
  onImageUpload?: (file: File, editor: TipTapEditor) => void | Promise<void>;
}

export function RichTextEditor({
  value = "",
  onChange,
  placeholder = "Write something...",
  id,
  disabled = false,
  className,
  contentClassName,
  onImageUpload,
}: RichTextEditorProps) {
  const onChangeRef = React.useRef(onChange);
  React.useLayoutEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
        horizontalRule: false,
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
      Image.configure({
        allowBase64: false,
      }),
      Youtube.configure({
        width: 640,
        height: 360,
        nocookie: true,
        modestBranding: true,
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: value,
    editable: !disabled,
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        class:
          "prose prose-sm max-w-none min-h-[160px] px-3 py-2 focus:outline-none",
        role: "textbox",
        "aria-multiline": "true",
      },
      handleDrop: (_view, event, _slice, _moved) => {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;
        const image = Array.from(files).find((f) => f.type.startsWith("image/"));
        if (image && editor && onImageUpload) {
          onImageUpload(image, editor);
          return true;
        }
        return false;
      },
      handlePaste: (_view, event, _slice) => {
        const files = event.clipboardData?.files;
        if (!files || files.length === 0) return false;
        const image = Array.from(files).find((f) => f.type.startsWith("image/"));
        if (image && editor && onImageUpload) {
          onImageUpload(image, editor);
          return true;
        }
        return false;
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

  const handleToolbarImageUpload = React.useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || !editor || !onImageUpload) return;
      await onImageUpload(file, editor);
    },
    [editor, onImageUpload]
  );

  return (
    <div
      className={`rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] focus-within:shadow-[var(--pm-focus)] ${
        disabled ? "opacity-50" : ""
      } ${className ?? ""}`}
    >
      <RichTextToolbar editor={editor} onImageUpload={onImageUpload ? handleToolbarImageUpload : undefined} />
      <EditorContent
        editor={editor}
        className={`rounded-b-lg ${contentClassName ?? ""}`}
        placeholder={placeholder ?? ""}
        aria-placeholder={placeholder ?? ""}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleFileChange}
      />
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {editor ? `${editor.getText().length} characters` : ""}
      </div>
    </div>
  );
}

export type { Editor } from "@tiptap/react";
