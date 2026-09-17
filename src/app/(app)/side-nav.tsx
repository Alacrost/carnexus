"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DashboardIcon,
  InventoryIcon,
  MarketingIcon,
  LeadsIcon,
  SettingsIcon,
  BusinessIcon,
} from "@/components/icons";

type NavItem = { href: string; label: string; icon: typeof DashboardIcon };

export function SideNav({
  canBusiness,
  canDeals,
  sales,
  marketing,
  website,
}: {
  canBusiness: boolean;
  canDeals: boolean;
  sales: boolean;
  marketing: boolean;
  website: boolean;
}) {
  const pathname = usePathname();

  const groups: { label: string | null; items: NavItem[] }[] = [
    ...(sales
      ? [
          {
            label: "Sales & Stock",
            items: [
              { href: "/dashboard", label: "Dashboard", icon: DashboardIcon },
              { href: "/inventory", label: "Inventory", icon: InventoryIcon },
              { href: "/leads", label: "Leads", icon: LeadsIcon },
              ...(canDeals
                ? [
                    { href: "/business/deals", label: "Deals", icon: BusinessIcon },
                    { href: "/business/customers", label: "Customers", icon: LeadsIcon },
                  ]
                : []),
              ...(canBusiness
                ? [
                    { href: "/business/purchases", label: "Purchases", icon: BusinessIcon },
                    { href: "/business", label: "Sales & Accounts", icon: BusinessIcon },
                    { href: "/business/reports", label: "Reports", icon: DashboardIcon },
                  ]
                : []),
            ],
          },
        ]
      : []),
    ...(marketing
      ? [
          {
            label: "Marketing",
            items: [{ href: "/marketing", label: "Marketing Studio", icon: MarketingIcon }],
          },
        ]
      : []),
    ...(website
      ? [
          {
            label: "Website",
            items: [{ href: "/website", label: "Dealer Website", icon: MarketingIcon }],
          },
        ]
      : []),
    {
      label: null,
      items: [{ href: "/settings", label: "Settings", icon: SettingsIcon }],
    },
  ];

  return (
    <nav className="flex-1 space-y-5 p-3">
      {groups.map((group, gi) => (
        <div key={gi} className="space-y-1">
          {group.label && (
            <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              {group.label}
            </p>
          )}
          {group.items.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-150 ${
                  active
                    ? "bg-white/[0.06] text-white"
                    : "text-slate-400 hover:bg-white/[0.03] hover:text-white"
                }`}
              >
                <span
                  className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-gradient-to-b from-sky-400 to-violet-500 transition-opacity duration-150 ${
                    active ? "opacity-100" : "opacity-0 group-hover:opacity-40"
                  }`}
                />
                <Icon
                  size={17}
                  className={active ? "text-sky-300" : "text-slate-500 group-hover:text-slate-300"}
                />
                {label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
