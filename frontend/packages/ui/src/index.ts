export { designTokens } from "./tokens";
export type { DesignTokens } from "./tokens";
export { webTheme } from "./webTheme";

export { Button } from "./components/Button";
export type { ButtonProps } from "./components/Button";

export { InputField } from "./components/InputField";
export type { InputFieldProps } from "./components/InputField";

export { LoadingState, EmptyState, ErrorState } from "./components/State";

/*
 * `UI-CONS-10`（Wave UI-3）：`StatusBadge` 已移除 —— consumer 歸零後由
 * `apps/web/components/ds` 的 `StatusPill` 取代（canonical tone 值域，見 `lib/status-tone.ts`）。
 * `SurfaceCard` 仍有 1 個 consumer（`app/teacher/materials/[id]/reviews`），因此保留。
 */
export { SurfaceCard } from "./components/CardBadge";

export { AppDialog } from "./components/Dialog";
export type { AppDialogProps } from "./components/Dialog";

export { Uploader } from "./components/Uploader";
export type { UploaderProps } from "./components/Uploader";
