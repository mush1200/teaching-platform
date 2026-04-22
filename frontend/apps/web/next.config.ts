import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "react-native",
    "tamagui",
    "@tamagui/core",
    "@tamagui/config",
    "@tamagui/shorthands",
    "@teaching-platform/ui",
    "solito",
    "react-native-web",
  ],
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "react-native$": "react-native-web",
    };
    return config;
  },
};

export default nextConfig;
