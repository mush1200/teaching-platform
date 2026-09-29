import { createTamagui } from "tamagui";
import { config } from "@tamagui/config/v3";
import { webTheme } from "@teaching-platform/ui";
import { CANONICAL_FONT_STACK } from "./lib/font-stack";

const tamaguiConfig = createTamagui({
  ...config,
  /*
   * `UI-QA-FONT`：`TamaguiProvider` 以 `span.font_body` 包住整個 app，`@tamagui/config/v3` 的
   * 預設 family（`Inter, -apple-system, system-ui …`）因此覆蓋了 `<body>` 的字型，中文落到系統字型。
   * 這裡只把 family 換成 canonical 堆疊；尺寸／行高／字重維持 v3 原值（Tamagui 仍為 legacy-frozen）。
   */
  fonts: {
    ...config.fonts,
    body: { ...config.fonts.body, family: CANONICAL_FONT_STACK },
    heading: { ...config.fonts.heading, family: CANONICAL_FONT_STACK },
  },
  themes: {
    ...config.themes,
    light: {
      ...config.themes.light,
      ...webTheme,
    },
  },
});

export default tamaguiConfig;

export type AppTamaguiConfig = typeof tamaguiConfig;
