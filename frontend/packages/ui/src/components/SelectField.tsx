import { Label, Paragraph, Select, YStack } from "tamagui";
import { designTokens } from "../tokens";

export type SelectOption = {
  label: string;
  value: string;
};

export type SelectFieldProps = {
  id: string;
  label: string;
  value: string;
  options: SelectOption[];
  placeholder?: string;
  helperText?: string;
  errorText?: string;
  disabled?: boolean;
  onValueChange: (next: string) => void;
};

export function SelectField({
  id,
  label,
  value,
  options,
  placeholder = "請選擇",
  helperText,
  errorText,
  disabled,
  onValueChange,
}: SelectFieldProps) {
  return (
    <YStack gap="$2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <Select.Trigger
          id={id}
          borderWidth={1}
          opacity={disabled ? 0.6 : 1}
          pointerEvents={disabled ? "none" : "auto"}
          borderColor={errorText ? designTokens.colors.border.danger : designTokens.colors.border.default}
        >
          <Select.Value placeholder={placeholder} />
        </Select.Trigger>
        <Select.Content>
          <Select.ScrollUpButton />
          {/* unstyled：避免 Tamagui 預設把 elevate/bordered 當成 DOM 屬性傳到 div（React 19 會警告） */}
          <Select.Viewport
            unstyled
            minWidth={220}
            borderWidth={1}
            borderColor={designTokens.colors.border.default}
            backgroundColor={designTokens.colors.bg.surface}
            borderRadius={designTokens.radius.sm}
          >
            <Select.Group>
              {options.map((option, index) => (
                <Select.Item index={index} key={option.value} value={option.value}>
                  <Select.ItemText>{option.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Group>
          </Select.Viewport>
          <Select.ScrollDownButton />
        </Select.Content>
      </Select>
      {errorText ? (
        <Paragraph color={designTokens.colors.danger}>{errorText}</Paragraph>
      ) : helperText ? (
        <Paragraph color={designTokens.colors.text.muted}>{helperText}</Paragraph>
      ) : null}
    </YStack>
  );
}
