/**
 * Autonexus custom icon set — our own visual language (see AGENTS.md).
 * Unified geometric line motif: 24 grid, 1.6 stroke, round caps/joins, no fill.
 * Duotone accent lives on the container (studio-tile); glyphs use currentColor.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

/* ---- Navigation ---- */

export function DashboardIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="3" y="3" width="7.5" height="9" rx="1.6" />
      <rect x="3" y="15" width="7.5" height="6" rx="1.6" />
      <rect x="13.5" y="3" width="7.5" height="6" rx="1.6" />
      <rect x="13.5" y="12" width="7.5" height="9" rx="1.6" />
    </Icon>
  );
}

export function BusinessIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9.4a3.6 3.6 0 1 0 0 5.2" />
      <path d="M7.6 11h5M7.6 13.2h4.4" />
    </Icon>
  );
}

export function MarketingIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 10v4a1 1 0 0 0 1 1h2l2.5 4V6L7 9H5a1 1 0 0 0-1 1Z" />
      <path d="M14 8.5c1.6.8 1.6 6.2 0 7" />
      <path d="M17 6c3 1.4 3 10.6 0 12" />
    </Icon>
  );
}

export function InventoryIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 13.5 5.7 8a2 2 0 0 1 1.9-1.4h8.8A2 2 0 0 1 18.3 8L20 13.5" />
      <path d="M4 13.5h16v4a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-1H7.5v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z" />
      <path d="M7 16h.01M17 16h.01" />
    </Icon>
  );
}

export function LeadsIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.5a3 3 0 0 1 0 5.8" />
      <path d="M17.5 13.2A5.5 5.5 0 0 1 20.5 18" />
    </Icon>
  );
}

export function MessageIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 5.5h16v11H9l-4.5 3v-3H4Z" />
      <path d="M8 9h8M8 12.5h5" />
    </Icon>
  );
}

export function SettingsIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M5 7h9" />
      <path d="M18 7h1" />
      <circle cx="16" cy="7" r="2" />
      <path d="M5 17h4" />
      <path d="M13 17h6" />
      <circle cx="11" cy="17" r="2" />
    </Icon>
  );
}

export function LogoutIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M14 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8" />
      <path d="M17 8l4 4-4 4" />
      <path d="M21 12H10" />
    </Icon>
  );
}

/* ---- KPIs & accents ---- */

export function ReadyIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 3l7 3v5c0 4.2-2.8 7.5-7 9-4.2-1.5-7-4.8-7-9V6Z" />
      <path d="M9 12l2.2 2.2L15.5 10" />
    </Icon>
  );
}

export function SparkIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 3c.4 3.7 1.3 6.6 5 7-3.7.4-4.6 3.3-5 7-.4-3.7-1.3-6.6-5-7 3.7-.4 4.6-3.3 5-7Z" />
      <path d="M18.5 4.5c.15 1.2.5 1.9 1.7 2-1.2.15-1.55.9-1.7 2-.15-1.2-.5-1.9-1.7-2 1.2-.15 1.55-.9 1.7-2Z" />
    </Icon>
  );
}

/* ---- Marketing features ---- */

export function PhotoIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 16l4.5-4a2 2 0 0 1 2.7 0L15 16" />
      <path d="M14 14l1.8-1.6a2 2 0 0 1 2.6 0L21 14.5" />
      <circle cx="9" cy="9.5" r="1.3" />
    </Icon>
  );
}

export function LayersIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 3 3 7.5l9 4.5 9-4.5Z" />
      <path d="M3 12l9 4.5L21 12" />
      <path d="M3 16.5 12 21l9-4.5" />
    </Icon>
  );
}

export function WriteIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 20l1-4L16 5a2 2 0 0 1 3 3L8 19Z" />
      <path d="M14 7l3 3" />
      <path d="M5 16l3 3" />
    </Icon>
  );
}

export function BrandIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 3a9 9 0 1 0 0 18c1.3 0 2-.9 2-2 0-1.3-1-1.6-1-2.6 0-.8.7-1.4 1.6-1.4H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8Z" />
      <circle cx="8" cy="10" r="1.1" />
      <circle cx="12" cy="7.5" r="1.1" />
      <circle cx="16" cy="10" r="1.1" />
    </Icon>
  );
}

export function ScriptIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v4h4" />
      <path d="M8.5 12h7M8.5 15.5h7M8.5 19h4" />
    </Icon>
  );
}

export function AdsIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" />
    </Icon>
  );
}

export function PromoIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 8.5 11 4a2 2 0 0 1 2 0l7 4.5v7L13 20a2 2 0 0 1-2 0L4 15.5Z" />
      <path d="M9 9.5 15 15" />
      <circle cx="9.2" cy="9.7" r="0.6" />
      <circle cx="14.8" cy="14.8" r="0.6" />
    </Icon>
  );
}

export function CampaignIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="3" y="6" width="12" height="9" rx="1.6" />
      <path d="M15 9l5-3v11l-5-3" />
      <path d="M6 15v3a1 1 0 0 0 1 1h2v-4" />
    </Icon>
  );
}

/* ---- Utility ---- */

export function ArrowLeftIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M15 5l-7 7 7 7" />
      <path d="M8 12h11" />
    </Icon>
  );
}

export function ArrowRightIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M9 5l7 7-7 7" />
      <path d="M16 12H5" />
    </Icon>
  );
}

export function SearchIcon(p: IconProps) {
  return <Icon {...p}><circle cx="10.7" cy="10.7" r="6.7" /><path d="m15.6 15.6 5 5" /></Icon>;
}

export function HoldIcon(p: IconProps) {
  return <Icon {...p}><circle cx="12" cy="12" r="8.5" /><path d="M9.4 8.5v7M14.6 8.5v7" /></Icon>;
}

export function PrintIcon(p: IconProps) {
  return <Icon {...p}><path d="M6 8V3.5h12V8M6 17H4a1 1 0 0 1-1-1V10a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2" /><path d="M6 14h12v7H6zM17.5 11h.01" /></Icon>;
}

export function TagIcon(p: IconProps) {
  return <Icon {...p}><path d="M3.5 5.5h10l7 7-8 8-9-9Z" /><circle cx="8" cy="9" r="1.3" /></Icon>;
}

export function CalendarIcon(p: IconProps) {
  return <Icon {...p}><rect x="3" y="5.5" width="18" height="15" rx="1.5" /><path d="M7 3v5M17 3v5M3 10h18M8 14h3M8 17h6" /></Icon>;
}

export function ToolsIcon(p: IconProps) {
  return <Icon {...p}><path d="m4 20 8.5-8.5M9.5 6.5l8 8M14 4l1.5-1.5 6 6L20 10M4.5 5.5l3 3" /><path d="M3 18.5 5.5 21M17 13l4 4-4 4-4-4" /></Icon>;
}
