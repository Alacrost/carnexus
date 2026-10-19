"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  DashboardIcon,
  InventoryIcon,
  MarketingIcon,
  LeadsIcon,
  SettingsIcon,
  BusinessIcon,
  MessageIcon,
} from "@/components/icons";

type NavItem = { href: string; label: string; icon: typeof DashboardIcon; badge?: number };

/** Apply the operational palette without changing the studio or website workspace. */
export function CrmShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const studio = ["/marketing", "/website"].some((route) => pathname === route || pathname.startsWith(`${route}/`));
  return <div className={`crm-shell ${studio ? "" : "crm-retro"} flex min-h-screen flex-col text-slate-100 lg:flex-row`}>{children}</div>;
}

export function SideNav({
  canBusiness,
  canPurchase,
  canDeals,
  sales,
  marketing,
  website,
  unreadMessages,
  pendingCount,
}: {
  canBusiness: boolean;
  canPurchase: boolean;
  canDeals: boolean;
  sales: boolean;
  marketing: boolean;
  website: boolean;
  unreadMessages: number;
  pendingCount: number | null;
}) {
  const pathname = usePathname();

  const groups: { label: string | null; items: NavItem[] }[] = [
    ...(sales
      ? [
          {
            label: "Start here",
            items: [
              { href: "/dashboard", label: "Dashboard", icon: DashboardIcon },
              { href: "/pending", label: pendingCount===null?"Pending actions · !":`Pending actions · ${pendingCount}`, icon: DashboardIcon },
            ],
          },
          {
            label: "Vehicles",
            items: [
              { href: "/inventory", label: "Inventory", icon: InventoryIcon },
              { href: "/inventory/preparation", label: "Preparation", icon: InventoryIcon },
            ],
          },
          {
            label: "Contacts & follow-up",
            items: [
              ...(canDeals ? [{ href: "/business/customers", label: "Contacts", icon: LeadsIcon }] : []),
              { href: "/leads", label: "Leads", icon: LeadsIcon },
              { href: "/leads/tasks", label: "Tasks", icon: LeadsIcon },
              { href: "/leads/viewings", label: "Appointments", icon: LeadsIcon },
            ],
          },
          {
            label: "Sales & purchases",
            items: [
              ...(canDeals ? [{ href: "/business/deals", label: "Sales & Deals", icon: BusinessIcon }] : []),
              ...(canDeals ? [{ href: "/business/quotes", label: "Quotes", icon: BusinessIcon }] : []),
              ...(canPurchase ? [{ href: "/business/purchases", label: "Purchases", icon: BusinessIcon }] : []),
            ],
          },
          {
            label: "Money & accounts",
            items: [
              ...(canBusiness
                ? [
                    { href: "/business/financial-pending", label: "Pending payments & refunds", icon: BusinessIcon },
                    { href: "/business/bank", label: "Bank reconciliation", icon: BusinessIcon },
                    { href: "/business/accounting", label: "Accounting", icon: BusinessIcon },
                  ]
                : []),
            ],
          },
          {
            label: "Reports",
            items: [
              ...(canBusiness ? [{ href: "/business/reports", label: "Financial & sales", icon: DashboardIcon }] : []),
              { href: "/leads/reports", label: "CRM pipeline", icon: DashboardIcon },
            ],
          },
        ]
      : []),
    ...(marketing || website
      ? [
          {
            label: "Growth",
            items: [
              ...(marketing ? [{ href: "/marketing", label: "Marketing Studio", icon: MarketingIcon }] : []),
              ...(website ? [{ href: "/website", label: "Dealer Website", icon: MarketingIcon }] : []),
            ],
          },
        ]
      : []),
    {
      label: "Communication",
      items: [{ href: "/messages", label: "Message Centre", icon: MessageIcon, badge: unreadMessages }],
    },
    {
      label: "Administration",
      items: [{ href: "/settings", label: "Settings", icon: SettingsIcon }],
    },
  ];
  const activeHref=groups.flatMap(group=>group.items).filter(item=>pathname===item.href||pathname.startsWith(item.href+"/")).sort((a,b)=>b.href.length-a.href.length)[0]?.href;

  return (
    <nav aria-label="Main navigation" className="crm-navigation flex-1 space-y-4 overflow-y-auto px-3 py-4">
      {groups.filter((group) => group.items.length > 0).map((group) => (
        <div key={group.label} className="crm-nav-group space-y-1">
          {group.label && (
            <p className="crm-nav-heading px-3 pb-1 pt-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              {group.label}
            </p>
          )}
          {group.items.map(({ href, label, icon: Icon, badge }) => {
            const active = href===activeHref;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`crm-nav-link group relative flex items-center gap-3 rounded-[4px] px-3 py-2 text-[13px] font-medium transition-colors duration-150 ${
                  active
                    ? "bg-[#1c1c1e] text-[#f8f8f6] shadow-[0_7px_16px_-12px_rgba(0,0,0,0.8)]"
                    : "text-slate-400 hover:bg-black/[0.045] hover:text-slate-100"
                }`}
              >
                <Icon
                  size={17}
                  className={active ? "text-[#f8f8f6]" : "text-slate-500 group-hover:text-slate-300"}
                />
                <span className="min-w-0">{label}</span>
                {Boolean(badge) && <span className={`ml-auto min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-semibold tabular-nums ${active?"bg-[#ffffff]/20 text-[#fff]":"bg-[#1c1c1e] text-[#fff]"}`}>{badge! > 99 ? "99+" : badge}</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
