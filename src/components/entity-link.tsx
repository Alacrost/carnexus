import Link from "next/link";

export type EntityKind = "deal" | "po" | "so" | "customer" | "vehicle";

const prefixes: Record<EntityKind, string> = {
  deal: "DEAL",
  po: "PO",
  so: "SO",
  customer: "CUS",
  vehicle: "CAR",
};

export function entityReference(kind: EntityKind, reference: string | null | undefined, id: string) {
  const value = reference?.trim();
  if (value) return value;
  return `${prefixes[kind]}-${id.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

export function vehicleReference(number: number | null | undefined) {
  return number ? `V-${String(number).padStart(6, "0")}` : null;
}

export function EntityLink({ kind, id, reference, href, className = "" }: {
  kind: EntityKind;
  id: string;
  reference?: string | null;
  href: string;
  className?: string;
}) {
  const number = entityReference(kind, reference, id);
  return (
    <Link href={href} aria-label={`Open ${kind} ${number}`} className={`entity-reference ${className}`}>
      <span className="entity-reference__kind">{prefixes[kind]}</span>
      <span className="entity-reference__number">{number}</span>
      <span aria-hidden="true" className="entity-reference__arrow">↗</span>
    </Link>
  );
}
