/**
 * Module: EmptyState
 * Purpose: Reusable empty state with icon, title, description, and optional CTA
 * Used by: Data Bank, HPP Manager, Reports list, Ads, Cashflow pages
 * Dependencies: lucide-react, next/link
 * Public functions: EmptyState (default export)
 * Side effects: None
 */
"use client";

import type { LucideIcon } from "lucide-react";
import { InboxIcon } from "lucide-react";
import Link from "next/link";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}

export default function EmptyState({
  icon: Icon = InboxIcon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[var(--accent-soft)] flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-[var(--accent)]" />
      </div>
      <h3 className="text-base font-semibold text-[var(--foreground)] mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-[var(--text-subtle)] max-w-sm mb-5">{description}</p>
      )}
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="px-4 py-2 rounded-xl action-primary text-sm font-semibold"
        >
          {actionLabel}
        </Link>
      )}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="px-4 py-2 rounded-xl action-primary text-sm font-semibold"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
