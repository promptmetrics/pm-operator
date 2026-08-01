"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "./Button";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [pending, setPending] = React.useState(false);

  const handleConfirm = async () => {
    setPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--pm-ink)]/50 data-[state=open]:animate-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[var(--pm-radius-lg)] border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-6 shadow-[var(--pm-shadow-lg)] focus:outline-none">
          <Dialog.Title className="text-lg font-semibold text-[var(--pm-ink)]">{title}</Dialog.Title>
          {description ? (
            <Dialog.Description className="mt-2 text-sm text-[var(--pm-muted)]">
              {description}
            </Dialog.Description>
          ) : null}
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button type="button" variant="secondary" disabled={pending}>
                {cancelLabel}
              </Button>
            </Dialog.Close>
            <Button
              type="button"
              variant={destructive ? "danger" : "primary"}
              disabled={pending}
              onClick={handleConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
