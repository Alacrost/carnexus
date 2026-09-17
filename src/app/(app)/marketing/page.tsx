import Link from "next/link";
import {
  SparkIcon,
  PhotoIcon,
  WriteIcon,
  MarketingIcon,
  LeadsIcon,
  BrandIcon,
  ScriptIcon,
  LayersIcon,
  ArrowRightIcon,
  SettingsIcon,
  PromoIcon,
  CampaignIcon,
} from "@/components/icons";
import { requireSession } from "@/lib/auth";
import { can, hasModule } from "@/lib/types";
import { ModuleUpsell } from "@/components/module-upsell";

type Stage = "Live" | "Stage 2" | "Stage 3";

interface Feature {
  icon: typeof PhotoIcon;
  title: string;
  does: string; // one objective line: what it does
  stage: Stage;
  href: string | null;
}

const groups: { heading: string; hint: string; items: Feature[] }[] = [
  {
    heading: "Create",
    hint: "Turn a car into ready-to-publish assets.",
    items: [
      {
        icon: CampaignIcon,
        title: "Campaign Composer · Start here",
        does: "One car → ready-to-post text + sized images for every channel.",
        stage: "Live",
        href: "/marketing/campaigns",
      },
      {
        icon: WriteIcon,
        title: "DoneDeal Description Studio",
        does: "Standard DoneDeal listings by car type (SUV, 7-seater, hatch…) — generate & edit.",
        stage: "Live",
        href: "/marketing/donedeal",
      },
      {
        icon: MarketingIcon,
        title: "Social Media Studio",
        does: "Plan your week + generate Facebook & Instagram posts — never worry what to post.",
        stage: "Live",
        href: "/marketing/social",
      },
      {
        icon: LayersIcon,
        title: "Cover Photo Studio",
        does: "Overlay your badges onto any cover photo and export.",
        stage: "Live",
        href: "/marketing/photos",
      },
      {
        icon: PromoIcon,
        title: "Promotions & Events",
        does: "Spin up a seasonal sale with AI angles + a shareable T&C page.",
        stage: "Live",
        href: "/marketing/promotions",
      },
    ],
  },
  {
    heading: "Brand & Templates",
    hint: "Set it once — everything the AI makes follows it.",
    items: [
      {
        icon: SettingsIcon,
        title: "Business Setup",
        does: "Your hours, warranty, finance, contacts & socials — fed to the AI.",
        stage: "Live",
        href: "/marketing/business",
      },
      {
        icon: BrandIcon,
        title: "Brand Kit",
        does: "Logo rules, colours, tone and your standard blocks.",
        stage: "Live",
        href: "/marketing/brand-kit",
      },
      {
        icon: ScriptIcon,
        title: "Ad Scripts",
        does: "Save reusable description layouts the AI fills per car.",
        stage: "Live",
        href: "/marketing/scripts",
      },
    ],
  },
  {
    heading: "Coming soon",
    hint: "On the roadmap — not available yet.",
    items: [
      {
        icon: SparkIcon,
        title: "Social Content",
        does: "Posts, stories and reel scripts tuned per platform.",
        stage: "Stage 2",
        href: null,
      },
      {
        icon: MarketingIcon,
        title: "Managed Ads — IG, FB & Google",
        does: "Campaign assistance with cost-per-lead and cost-per-sale reporting.",
        stage: "Stage 3",
        href: null,
      },
    ],
  },
];

function StageBadge({ stage }: { stage: Stage }) {
  const live = stage === "Live";
  return (
    <span
      className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${
        live
          ? "border border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
          : "border border-white/10 bg-white/[0.04] text-slate-400"
      }`}
    >
      {live ? "Live" : stage}
    </span>
  );
}

function FeatureCard({ f }: { f: Feature }) {
  const Icon = f.icon;
  const body = (
    <div
      className={`studio-surface studio-edge h-full p-5 ${
        f.href ? "studio-interactive" : "opacity-70"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="studio-tile h-10 w-10">
          <Icon size={18} />
        </span>
        <h3 className="font-medium text-slate-100">{f.title}</h3>
        <StageBadge stage={f.stage} />
      </div>
      <p className="mt-3 text-sm text-slate-400">{f.does}</p>
      {f.href && (
        <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-sky-400">
          Open <ArrowRightIcon size={13} />
        </span>
      )}
    </div>
  );
  return f.href ? (
    <Link href={f.href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export default async function MarketingPage() {
  const session = await requireSession();
  if (!hasModule(session.dealer.modules, "marketing")) return <ModuleUpsell product="Marketing Studio" />;

  return (
    <div className="space-y-10">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-400/80">
          The core of Autonexus
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gradient">
          Marketing Studio
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          From real photos to published campaigns — organized so you always know
          what to do next.
        </p>
      </div>

      {/* Start here */}
      <Link
        href="/marketing/ads"
        className="studio-surface studio-interactive studio-edge relative block overflow-hidden p-6"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="studio-tile h-14 w-14 shrink-0">
            <PhotoIcon size={24} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-sky-400/25 bg-sky-400/10 px-2 py-0.5 text-[11px] font-medium text-sky-300">
                Start here
              </span>
            </div>
            <h2 className="mt-2 text-lg font-semibold text-slate-100">
              Create your first ad
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Pick a vehicle, choose a channel, and the studio writes the copy
              with your brand applied automatically.
            </p>
          </div>
          <ArrowRightIcon
            size={20}
            className="hidden shrink-0 text-slate-500 sm:ml-auto sm:block"
          />
        </div>
      </Link>

      {/* Feature groups */}
      {groups.map((g) => (
        <section key={g.heading}>
          <div className="flex items-baseline gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
              {g.heading}
            </h2>
            <span className="text-xs text-slate-500">{g.hint}</span>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map((f) => (
              <FeatureCard key={f.title} f={f} />
            ))}
          </div>
        </section>
      ))}

      {can.manageMembers(session.role) && (
        <div className="studio-surface studio-edge overflow-hidden p-6">
          <div className="flex items-center gap-3">
            <span className="studio-tile h-10 w-10">
              <LeadsIcon size={18} />
            </span>
            <h2 className="font-medium text-slate-100">Agency access</h2>
            <span className="ml-auto rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-slate-400">
              Stage 2
            </span>
          </div>
          <p className="mt-3 text-sm text-slate-400">
            Grant our in-office marketing team access to run your campaigns —
            one click, revocable anytime. The team only sees your marketing
            module and vehicle data: <strong className="text-slate-200">never</strong>{" "}
            your customers, buy prices or billing. Every action is audit-logged.
          </p>
        </div>
      )}
    </div>
  );
}
