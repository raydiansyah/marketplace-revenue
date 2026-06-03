"use client";

import { useEffect } from "react";
import { useAppStore } from "@/store/app-store";
import { useAuth } from "@/lib/auth/auth-context";
import { flushPending } from "@/lib/debounce-fetch";

export function DataLoader() {
  const { user } = useAuth();
  const loadSavedReports = useAppStore((s) => s.loadSavedReports);
  const loadHpp = useAppStore((s) => s.loadHpp);
  const loadConfigs = useAppStore((s) => s.loadConfigs);

  useEffect(() => {
    if (user) {
      loadSavedReports();
      loadHpp();
      loadConfigs();
    }
  }, [user, loadSavedReports, loadHpp, loadConfigs]);

  // Flush semua pending debounced requests saat tab/window ditutup,
  // agar data HPP dan config tidak hilang jika user menutup tab sebelum debounce trigger.
  useEffect(() => {
    const handleBeforeUnload = () => {
      flushPending();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  return null;
}
