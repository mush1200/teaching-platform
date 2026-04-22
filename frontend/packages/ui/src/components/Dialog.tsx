import { ReactNode } from "react";
import { Button, Dialog, Paragraph, Unspaced, XStack } from "tamagui";

export type AppDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  children?: ReactNode;
};

export function AppDialog({
  open,
  title,
  description,
  confirmLabel = "確認",
  cancelLabel = "取消",
  onOpenChange,
  onConfirm,
  children,
}: AppDialogProps) {
  return (
    <Dialog modal open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay key="overlay" opacity={0.5} />
        <Dialog.Content bordered elevate key="content" gap="$4" padding="$5" minWidth={360}>
          <Dialog.Title>{title}</Dialog.Title>
          {description ? <Paragraph>{description}</Paragraph> : null}
          {children}
          <XStack justifyContent="flex-end" gap="$3">
            <Dialog.Close asChild>
              <Button>{cancelLabel}</Button>
            </Dialog.Close>
            <Dialog.Close asChild>
              <Button theme="active" onPress={onConfirm}>
                {confirmLabel}
              </Button>
            </Dialog.Close>
          </XStack>
          <Unspaced>
            <Dialog.Close asChild>
              <Button
                position="absolute"
                top="$3"
                right="$3"
                size="$2"
                circular
                aria-label="Close"
              >
                x
              </Button>
            </Dialog.Close>
          </Unspaced>
        </Dialog.Content>
      </Dialog.Portal>

    </Dialog>
  );
}
