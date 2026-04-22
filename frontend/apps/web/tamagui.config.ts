import { createTamagui } from "tamagui";
import { config } from "@tamagui/config/v3";
import { webTheme } from "@teaching-platform/ui";

const tamaguiConfig = createTamagui({
  ...config,
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
