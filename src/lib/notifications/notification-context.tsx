"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, XCircle, X } from "lucide-react";

export type NotificationType = "success" | "error" | "warning";

interface ToastItem {
  id: string;
  type: NotificationType;
  message: string;
}

interface NotificationContextValue {
  notify: (type: NotificationType, message: string) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

function getToastStyles(type: NotificationType): string {
  if (type === "success") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (type === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-red-200 bg-red-50 text-red-800";
}

function ToastIcon({ type }: { type: NotificationType }) {
  if (type === "success") return <CheckCircle2 className="w-4 h-4" />;
  if (type === "warning") return <AlertTriangle className="w-4 h-4" />;
  return <XCircle className="w-4 h-4" />;
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const notify = useCallback((type: NotificationType, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev, { id, type, message }]);

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 3600);
  }, []);

  const value = useMemo<NotificationContextValue>(() => ({ notify }), [notify]);

  return (
    <NotificationContext.Provider value={value}>
      {children}

      <div className="fixed top-4 right-4 z-[100] space-y-2 w-[min(92vw,420px)]">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`border rounded-xl shadow-sm px-3 py-2.5 flex items-start gap-2 ${getToastStyles(
              toast.type
            )}`}
          >
            <div className="mt-0.5 shrink-0">
              <ToastIcon type={toast.type} />
            </div>
            <p className="text-sm leading-relaxed flex-1">{toast.message}</p>
            <button
              onClick={() => setToasts((prev) => prev.filter((item) => item.id !== toast.id))}
              className="opacity-70 hover:opacity-100 transition-opacity"
              aria-label="Tutup notifikasi"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotification must be used within NotificationProvider");
  return ctx;
}
