"use client";

import { PropsWithChildren } from "react";
import { NextThemeProvider } from "@tamagui/next-theme";
import { TamaguiProvider } from "tamagui";
import tamaguiConfig from "../tamagui.config";

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <NextThemeProvider defaultTheme="light" onChangeTheme={() => {}}>
      <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
        {children}
      </TamaguiProvider>
    </NextThemeProvider>
  );
}
