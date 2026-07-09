"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  isMaterialDetailPath,
  readSidebarCollapsedPreference,
  writeSidebarCollapsedPreference,
} from "./sidebar-constants";

export function useSidebarCollapse() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (isMaterialDetailPath(pathname)) {
      setCollapsed(true);
      return;
    }
    setCollapsed(readSidebarCollapsedPreference());
  }, [pathname]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      if (!isMaterialDetailPath(pathname)) {
        writeSidebarCollapsedPreference(next);
      }
      return next;
    });
  }, [pathname]);

  const setCollapsedPersisted = useCallback(
    (next: boolean) => {
      setCollapsed(next);
      if (!isMaterialDetailPath(pathname)) {
        writeSidebarCollapsedPreference(next);
      }
    },
    [pathname],
  );

  return { collapsed, toggleCollapsed, setCollapsed: setCollapsedPersisted };
}
