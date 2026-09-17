import Link from "next/link";
import {
  WriteIcon,
  LeadsIcon,
  InventoryIcon,
  DashboardIcon,
  ReadyIcon,
  ArrowRightIcon,
} from "@/components/icons";

// Copy source: docs/LANDING_PAGE.md — benefit/outcome-led, for the business owner.

// Loss aversion — what the old way quietly costs.
const costs = [
  {
    lost: "A sale, gone",
    line: "A lead messages at 9pm Saturday. Nobody replies until Monday. They buy elsewhere.",
  },
  {
    lost: "Hours, every week",
    line: "The same DoneDeal ad, rewritten car after car, instead of selling.",
  },
  {
    lost: "Cash on the forecourt",
    line: "That 2018 Qashqai sat for 60 days and nobody flagged it.",
  },
  {
    lost: "Ad budget, wasted",
    line: "You pay for ads but can't tell which ones actually move metal.",
  },
];

// Outcomes — what changes for the business.
const outcomes = [
  {
    icon: WriteIcon,
    title: "Get hours back every week",
    text: "Photos and specs in, a polished DoneDeal, Facebook and Instagram ad out in ~30 seconds. Your team closes deals instead of typing them.",
  },
  {
    icon: LeadsIcon,
    title: "Stop losing leads to slow replies",
    text: "Every enquiry lands in one pipeline with an instant first reply — day or night. The lead that used to wait till Monday gets answered now.",
    badge: "Coming soon",
  },
  {
    icon: InventoryIcon,
    title: "Move stock before it ages",
    text: "Aging and price-vs-market alerts surface the car nobody noticed, so your cash isn't parked on the forecourt.",
  },
  {
    icon: DashboardIcon,
    title: "Spend ad money that pays back",
    text: "Cost per lead, conversion and profit in one view. Cut what doesn't sell, double down on what does.",
  },
];

const value = [
  { stat: "~30s", label: "to a ready-to-post ad — not an afternoon" },
  { stat: "1 place", label: "for stock, ads and leads — no more tab juggling" },
  { stat: "24/7", label: "every lead captured, even after hours" },
  { stat: "€0", label: "wasted on ads you can't measure" },
];

const plans = [
  {
    name: "Starter",
    price: "€99",
    tagline: "For the single forecourt getting organised.",
    features: ["2 users", "30 vehicles", "50 AI ads / month", "Lead pipeline", "Email support"],
  },
  {
    name: "Professional",
    price: "€199",
    highlight: true,
    tagline: "The workhorse for a busy dealership.",
    features: [
      "10 users",
      "150 vehicles",
      "300 AI ads / month",
      "Auto lead replies",
      "Full marketing dashboard",
      "Priority support",
    ],
  },
  {
    name: "Dealer Group",
    price: "€499+",
    tagline: "Multi-location, one command centre.",
    features: [
      "Unlimited users & vehicles",
      "Unlimited AI ads",
      "Multi-location dashboard",
      "Dedicated support",
    ],
  },
];

const faqs = [
  {
    q: "How long until it pays for itself?",
    a: "One extra sale a month covers the plan several times over. Most of the value shows up in week one — the hours your team stops spending on ad copy.",
  },
  {
    q: "Is my data safe?",
    a: "Each dealership's data is fully isolated and hosted in the EU. GDPR-compliant. You own your data and can export it anytime.",
  },
  {
    q: "Do I need to install anything?",
    a: "No — it runs in the browser and works on your phone.",
  },
  {
    q: "Does it post to DoneDeal automatically?",
    a: "Ad text is generated ready to paste today; direct publishing integrations are on the roadmap.",
  },
  { q: "Can I cancel?", a: "Anytime, no contracts." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen text-slate-100">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="text-xl font-bold tracking-tight">
          Auto<span className="text-gradient">nexus</span>
        </span>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/login" className="text-slate-300 transition hover:text-white">
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-xl border border-sky-400/30 bg-gradient-to-b from-sky-500 to-sky-600 px-4 py-2 font-medium text-white shadow-[0_10px_30px_-12px_var(--glow)] transition hover:brightness-110"
          >
            Start free trial
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-24 pt-16 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-sky-400/25 bg-sky-400/10 px-3 py-1 text-xs font-medium text-sky-300">
          AI Sales &amp; Marketing Studio · Built for Irish dealers
        </span>
        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
          Sell more cars in less time.{" "}
          <span className="text-gradient">Waste fewer leads.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
          Autonexus does the marketing grunt work for your forecourt — writing
          your ads, watching your stock and catching every lead — so your team
          spends its time closing, not typing.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 rounded-xl border border-sky-400/30 bg-gradient-to-b from-sky-500 to-sky-600 px-6 py-3 font-medium text-white shadow-[0_16px_40px_-16px_var(--glow)] transition hover:brightness-110"
          >
            Start free trial <ArrowRightIcon size={16} />
          </Link>
          <a
            href="#pricing"
            className="rounded-xl border border-white/10 px-6 py-3 font-medium text-slate-200 transition hover:border-white/25 hover:bg-white/[0.03]"
          >
            See pricing
          </a>
        </div>
        <p className="mt-3 text-sm text-slate-500">
          14 days free · No card required · Cancel anytime
        </p>

        {/* Value strip */}
        <div className="mx-auto mt-16 grid max-w-4xl gap-4 sm:grid-cols-4">
          {value.map((v, i) => (
            <div
              key={v.label}
              className="studio-surface animate-rise p-5 text-left"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <p className="text-2xl font-semibold tracking-tight text-gradient">
                {v.stat}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{v.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Cost of the old way */}
      <section className="border-y border-white/5 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-center text-xs font-medium uppercase tracking-[0.2em] text-sky-400/80">
            The old way is costing you
          </p>
          <h2 className="mt-2 text-center text-2xl font-semibold sm:text-3xl">
            Every week without it has a price tag.
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {costs.map((c) => (
              <div key={c.line} className="studio-surface studio-edge p-6">
                <span className="text-xs font-semibold uppercase tracking-wider text-red-300/80">
                  {c.lost}
                </span>
                <p className="mt-2 text-slate-300">&ldquo;{c.line}&rdquo;</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Outcomes */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <p className="text-center text-xs font-medium uppercase tracking-[0.2em] text-sky-400/80">
          What changes for your business
        </p>
        <h2 className="mt-2 text-center text-2xl font-semibold sm:text-3xl">
          Less busywork. More sold cars.
        </h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {outcomes.map(({ icon: Icon, title, text, badge }) => (
            <div key={title} className="studio-surface studio-interactive studio-edge p-6">
              <div className="flex items-center gap-3">
                <span className="studio-tile h-11 w-11">
                  <Icon size={20} />
                </span>
                <h3 className="font-semibold text-slate-100">{title}</h3>
                {badge && (
                  <span className="ml-auto rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-slate-400">
                    {badge}
                  </span>
                )}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Built for Ireland */}
      <section className="border-y border-white/5 py-16">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <div className="flex items-center justify-center gap-2">
            <span className="studio-tile h-9 w-9">
              <ReadyIcon size={18} />
            </span>
            <h2 className="text-2xl font-semibold">Built for Ireland, trusted by design</h2>
          </div>
          <div className="mx-auto mt-8 grid max-w-3xl gap-3 text-sm text-slate-300 sm:grid-cols-2">
            <p>✓ DoneDeal &amp; Carzone ad formats out of the box</p>
            <p>✓ NCT expiry tracking on every vehicle</p>
            <p>✓ GDPR-compliant, data hosted in the EU</p>
            <p>✓ Finance pre-qualification for Irish lenders</p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-2xl font-semibold sm:text-3xl">
          Up and running today
        </h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {[
            "Add your cars — 2 minutes each.",
            "Generate ads and share everywhere.",
            "Watch leads arrive — reply, book test drives, sell.",
          ].map((step, i) => (
            <div key={step} className="studio-surface p-6 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-b from-sky-500 to-violet-600 font-semibold text-white shadow-[0_10px_30px_-12px_var(--glow)]">
                {i + 1}
              </div>
              <p className="mt-4 text-slate-300">{step}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-y border-white/5 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-2xl font-semibold sm:text-3xl">
            Pays for itself with one extra sale.
          </h2>
          <p className="mt-2 text-center text-sm text-slate-400">
            Simple pricing. No contracts. Cancel anytime.
          </p>
          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`studio-surface relative p-6 ${
                  plan.highlight ? "ring-1 ring-sky-400/40" : ""
                }`}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-6 rounded-full border border-sky-400/30 bg-gradient-to-b from-sky-500 to-sky-600 px-3 py-0.5 text-[11px] font-medium text-white">
                    Most popular
                  </span>
                )}
                <h3 className="font-semibold text-slate-100">{plan.name}</h3>
                <p className="mt-1 text-xs text-slate-400">{plan.tagline}</p>
                <p className="mt-4 text-3xl font-bold">
                  {plan.price}
                  <span className="text-base font-normal text-slate-400">/mo</span>
                </p>
                <ul className="mt-5 space-y-2 text-sm text-slate-300">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <ReadyIcon size={15} className="shrink-0 text-sky-400" /> {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className={`mt-6 block rounded-xl py-2.5 text-center text-sm font-medium transition ${
                    plan.highlight
                      ? "border border-sky-400/30 bg-gradient-to-b from-sky-500 to-sky-600 text-white shadow-[0_10px_30px_-12px_var(--glow)] hover:brightness-110"
                      : "border border-white/10 text-slate-200 hover:border-white/25 hover:bg-white/[0.03]"
                  }`}
                >
                  Start free trial
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-6 py-20">
        <h2 className="text-center text-2xl font-semibold sm:text-3xl">
          Frequently asked questions
        </h2>
        <div className="mt-8 space-y-4">
          {faqs.map((f) => (
            <details key={f.q} className="studio-surface p-5">
              <summary className="cursor-pointer font-medium text-slate-100">
                {f.q}
              </summary>
              <p className="mt-3 text-sm text-slate-400">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-white/5 py-20 text-center">
        <div className="mx-auto max-w-2xl px-6">
          <h2 className="text-2xl font-semibold sm:text-3xl">
            Your next lead shouldn&apos;t wait until Monday.
          </h2>
          <p className="mt-3 text-slate-400">
            Start today and let the studio handle the busywork while you sell.
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-flex items-center gap-2 rounded-xl border border-sky-400/30 bg-gradient-to-b from-sky-500 to-sky-600 px-8 py-3 font-medium text-white shadow-[0_16px_40px_-16px_var(--glow)] transition hover:brightness-110"
          >
            Start free trial <ArrowRightIcon size={16} />
          </Link>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl items-center justify-between px-6 py-8 text-sm text-slate-500">
        <span>© {new Date().getFullYear()} Autonexus</span>
        <span>Made for Irish dealers 🇮🇪</span>
      </footer>
    </div>
  );
}
