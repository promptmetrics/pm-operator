import * as React from "react";
import type { Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Code,
  Link,
  Unlink,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Image as ImageIcon,
  Film,
} from "lucide-react";

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export interface RichTextToolbarProps {
  editor: Editor | null;
  onImageUpload?: () => void;
}

interface ToolbarButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  children: React.ReactNode;
}

function ToolbarButton({ active, className, children, ...props }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pm-coral)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        active
          ? "bg-[var(--pm-coral)] text-[var(--pm-on-ink)]"
          : "text-[var(--pm-ink)] hover:bg-[var(--pm-paper-2)]",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function RichTextToolbar({ editor, onImageUpload }: RichTextToolbarProps) {
  if (!editor) return null;

  const setLink = () => {
    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL", previousUrl ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const addYoutube = () => {
    const url = window.prompt("YouTube URL");
    if (!url) return;
    editor.commands.setYoutubeVideo({ src: url });
  };

  return (
    <div
      role="toolbar"
      aria-label="Text formatting"
      className="flex flex-wrap items-center gap-1 rounded-t-lg border border-b-0 border-[var(--pm-line)] bg-[var(--pm-paper-2)] p-2"
    >
      <ToolbarButton
        aria-label="Bold"
        aria-pressed={editor.isActive("bold")}
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        disabled={!editor.can().chain().focus().toggleBold().run()}
      >
        <Bold className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>

      <ToolbarButton
        aria-label="Italic"
        aria-pressed={editor.isActive("italic")}
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        disabled={!editor.can().chain().focus().toggleItalic().run()}
      >
        <Italic className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>

      <ToolbarButton
        aria-label="Inline code"
        aria-pressed={editor.isActive("code")}
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
        disabled={!editor.can().chain().focus().toggleCode().run()}
      >
        <Code className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>

      <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />

      <ToolbarButton
        aria-label="Heading 1"
        aria-pressed={editor.isActive("heading", { level: 1 })}
        active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        disabled={!editor.can().chain().focus().toggleHeading({ level: 1 }).run()}
      >
        <Heading1 className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>

      <ToolbarButton
        aria-label="Heading 2"
        aria-pressed={editor.isActive("heading", { level: 2 })}
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        disabled={!editor.can().chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>

      <ToolbarButton
        aria-label="Bullet list"
        aria-pressed={editor.isActive("bulletList")}
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        disabled={!editor.can().chain().focus().toggleBulletList().run()}
      >
        <List className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>

      <ToolbarButton
        aria-label="Ordered list"
        aria-pressed={editor.isActive("orderedList")}
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        disabled={!editor.can().chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>

      <ToolbarButton
        aria-label="Blockquote"
        aria-pressed={editor.isActive("blockquote")}
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        disabled={!editor.can().chain().focus().toggleBlockquote().run()}
      >
        <Quote className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>

      <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />

      <ToolbarButton
        aria-label="Add link"
        aria-pressed={editor.isActive("link")}
        active={editor.isActive("link")}
        onClick={setLink}
        disabled={!editor.isActive("link") && !editor.can().setLink({ href: "https://example.com" })}
      >
        <Link className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>

      <ToolbarButton
        aria-label="Remove link"
        onClick={() => editor.chain().focus().unsetLink().run()}
        disabled={!editor.isActive("link")}
      >
        <Unlink className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>

      <ToolbarButton
        aria-label="Add image"
        onClick={onImageUpload}
        disabled={!onImageUpload}
      >
        <ImageIcon className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>

      <ToolbarButton
        aria-label="Add YouTube video"
        onClick={addYoutube}
      >
        <Film className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>
    </div>
  );
}
