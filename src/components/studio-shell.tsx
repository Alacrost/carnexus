"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeftIcon } from "@/components/icons";

export type StudioGlyph = (p: { size?: number; className?: string }) => ReactNode;

export interface StudioTool {
  key: string;
  label: string;
  icon: StudioGlyph;
}

interface StudioShellProps {
  /** Title shown inside the toolbar. */
  title: string;
  /** Optional line under the title (hidden on small screens). */
  subtitle?: string;
  /** Back-arrow link target (e.g. "/marketing"). */
  backHref: string;
  /** Toolbar icon-tile glyph. */
  icon: StudioGlyph;
  /** Left tool-rail entries. */
  tools: StudioTool[];
  activeTool: string;
  onToolChange: (key: string) => void;
  /** Right-aligned toolbar actions (credits pill, export, etc.). */
  rightActions?: ReactNode;
  /**
   * Grid content after the rail: the center workspace and (optionally) the right
   * properties panel as two sibling elements — they fill the `1fr` and `360px` columns.
   * Wrap a properties panel in `<StudioProperties>` for the shared panel chrome.
   */
  children: ReactNode;
}

/**
 * Shared full-bleed "editing app" chrome for every Marketing Studio tool:
 * toolbar (title inside) · left tool rail · center workspace · right properties.
 * Extracted from the Cover Photo Studio so all tools share one design.
 */
export function StudioShell({
  title,
  subtitle,
  backHref,
  icon: Icon,
  tools,
  activeTool,
  onToolChange,
  rightActions,
  children,
}: StudioShellProps) {
  return (
    <div className="flex min-h-[calc(100vh-1px)] flex-col overflow-hidden border-y border-white/10 bg-[#0b0f17] shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)]">
      {/* App toolbar */}
      <div className="flex items-center gap-3 border-b border-white/10 bg-white/[0.02] px-4 py-3 lg:px-6">
        <Link
          href={backHref}
          title="Back to Marketing Studio"
          className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-white"
        >
          <ArrowLeftIcon size={16} />
        </Link>
        <span className="studio-tile grid h-9 w-9 place-items-center rounded-lg text-sky-300">
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold text-slate-100">{title}</h1>
          {subtitle && (
            <p className="hidden truncate text-xs text-slate-500 sm:block">{subtitle}</p>
          )}
        </div>
        {rightActions && (
          <div className="ml-auto flex items-center gap-2">{rightActions}</div>
        )}
      </div>

      {/* Workspace: tool rail · workspace · properties */}
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[76px_1fr_360px]">
        {/* Tool rail */}
        <nav className="flex gap-1 overflow-x-auto border-b border-white/10 bg-black/20 p-2 lg:flex-col lg:overflow-visible lg:border-b-0 lg:border-r">
          {tools.map((t) => {
            const active = activeTool === t.key;
            const Ico = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => onToolChange(t.key)}
                title={t.label}
                className={`flex shrink-0 flex-col items-center gap-1 rounded-lg px-2 py-2 text-[10px] transition ${
                  active
                    ? "bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/40"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                }`}
              >
                <Ico size={20} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>

        {children}
      </div>
    </div>
  );
}

/** Shared chrome for the right-hand properties column of a studio tool. */
export function StudioProperties({ children }: { children: ReactNode }) {
  return (
    <aside className="border-t border-white/10 bg-white/[0.02] p-4 lg:border-l lg:border-t-0">
      {children}
    </aside>
  );
}
