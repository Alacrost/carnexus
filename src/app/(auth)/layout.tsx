import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md animate-rise">
        <div className="mb-8 text-center">
          <Link href="/" className="text-2xl font-bold tracking-tight text-white">
            Auto<span className="text-gradient">nexus</span>
          </Link>
          <p className="mt-1 text-sm text-slate-400">
            AI Sales &amp; Marketing Assistant for dealers
          </p>
        </div>
        <div className="studio-surface p-8">{children}</div>
      </div>
    </div>
  );
}
