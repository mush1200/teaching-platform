import { createTamagui } from "tamagui";
import { config } from "@tamagui/config/v3";

const tamaguiConfig = createTamagui(config);

export default tamaguiConfig;

export type AppTamaguiConfig = typeof tamaguiConfig;
