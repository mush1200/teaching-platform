import { Input, Label, Paragraph, YStack } from "tamagui";
import { designTokens } from "../tokens";

export type InputFieldProps = {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  autoComplete?: string;
  secureTextEntry?: boolean;
  helperText?: string;
  errorText?: string;
  successText?: string;
  disabled?: boolean;
  onChangeText: (next: string) => void;
};

export function InputField({
  id,
  label,
  value,
  placeholder,
  autoComplete,
  secureTextEntry,
  helperText,
  errorText,
  successText,
  disabled,
  onChangeText,
}: InputFieldProps) {
  const message = errorText ?? successText ?? helperText;
  const messageColor = errorText
    ? designTokens.colors.danger
    : successText
      ? designTokens.colors.success
      : designTokens.colors.text.muted;

  return (
    <YStack gap="$2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        secureTextEntry={secureTextEntry}
        disabled={disabled}
        borderWidth={1}
        borderColor={errorText ? designTokens.colors.border.danger : designTokens.colors.border.default}
        onChangeText={onChangeText}
        aria-invalid={Boolean(errorText)}
      />
      {message ? <Paragraph color={messageColor}>{message}</Paragraph> : null}
    </YStack>
  );
}
