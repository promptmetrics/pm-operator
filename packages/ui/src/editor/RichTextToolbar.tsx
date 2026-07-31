import * as React from "react";
import type { Editor } from "@tiptap/react";
import { Bold, Italic, Code, Link, Unlink } from "lucide-react";

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export interface RichTextToolbarProps {
  editor: Editor | null;
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
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        active
          ? "bg-accent text-accent-foreground"
          : "text-foreground hover:bg-muted",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function RichTextToolbar({ editor }: RichTextToolbarProps) {
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

  return (
    <div
      role="toolbar"
      aria-label="Text formatting"
      className="flex items-center gap-1 rounded-t-lg border border-b-0 border-border bg-muted p-2"
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
    </div>
  );
}
