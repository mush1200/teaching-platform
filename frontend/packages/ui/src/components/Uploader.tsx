import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";
import { Button, Paragraph, View, YStack } from "tamagui";
import { designTokens } from "../tokens";

export type UploaderProps = {
  accept?: string[];
  maxSizeMb?: number;
  disabled?: boolean;
  onFileSelect: (file: File | null) => void;
  selectedFileName?: string;
  errorText?: string;
};

export function Uploader({
  accept = ["pdf", "png", "jpg", "jpeg"],
  maxSizeMb = 10,
  disabled,
  onFileSelect,
  selectedFileName,
  errorText,
}: UploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [internalHint, setInternalHint] = useState<string | null>(null);
  const acceptAttr = useMemo(() => accept.map((ext) => `.${ext}`).join(","), [accept]);

  function validateAndEmit(file: File | null) {
    if (!file) {
      onFileSelect(null);
      setInternalHint(null);
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase();
    const isAllowed = extension ? accept.includes(extension) : false;
    const isWithinSize = file.size <= maxSizeMb * 1024 * 1024;

    if (!isAllowed || !isWithinSize) {
      onFileSelect(null);
      if (!extension) {
        setInternalHint("請選擇副檔名清楚的檔案（例如 .pdf）。");
      } else if (!isAllowed) {
        setInternalHint(`不支援此格式（.${extension}）。允許：${accept.join(", ")}。`);
      } else {
        setInternalHint(`檔案超過 ${maxSizeMb}MB，請換較小的檔案。`);
      }
      return;
    }

    setInternalHint(null);
    onFileSelect(file);
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    validateAndEmit(file);
    event.target.value = "";
  }

  function onDropFile(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (disabled) {
      return;
    }
    const file = event.dataTransfer.files?.[0] ?? null;
    validateAndEmit(file);
  }

  return (
    <YStack gap="$2">
      <View
        borderWidth={1}
        borderStyle="dashed"
        borderColor={errorText ? designTokens.colors.border.danger : designTokens.colors.border.default}
        borderRadius={designTokens.radius.md}
        padding={designTokens.space.lg}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDropFile}
      >
        <YStack gap="$2" alignItems="flex-start">
          <Paragraph>拖曳檔案到這裡，或點擊下方按鈕選擇檔案。</Paragraph>
          <Button onPress={() => inputRef.current?.click()} disabled={disabled}>
            選擇檔案
          </Button>
          <input
            ref={inputRef}
            type="file"
            hidden
            accept={acceptAttr}
            onChange={onInputChange}
            disabled={disabled}
          />
          <Paragraph color={designTokens.colors.text.muted}>
            允許格式：{accept.join(", ")}，大小限制：{maxSizeMb}MB
          </Paragraph>
          {selectedFileName ? (
            <Paragraph color={designTokens.colors.success}>
              已選擇：{selectedFileName}（尚未上傳伺服器，僅本機預覽）
            </Paragraph>
          ) : null}
          {internalHint && !errorText ? (
            <Paragraph color={designTokens.colors.danger}>{internalHint}</Paragraph>
          ) : null}
        </YStack>
      </View>
      {errorText ? <Paragraph color={designTokens.colors.danger}>{errorText}</Paragraph> : null}
    </YStack>
  );
}
