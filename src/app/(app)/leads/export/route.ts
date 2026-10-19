import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import { csvFromRows, type CsvValue } from "@/lib/csv";

const exports = {
  leads: [
    ["title", "Enquiry"], ["customer", "Customer"], ["email", "Email"], ["phone", "Phone"], ["stage", "Stage"], ["source", "Source"], ["score", "Score"], ["next_action", "Next action"], ["next_action_at", "Next action at"], ["created_at", "Created at"],
  ],
  customers: [
    ["name", "Name"], ["type", "Type"], ["business_name", "Business"], ["email", "Email"], ["phone", "Phone"], ["mobile", "Mobile"], ["city", "City"], ["county", "County"], ["eircode", "Eircode"], ["created_at", "Created at"],
  ],
  tasks: [
    ["title", "Task"], ["type", "Type"], ["status", "Status"], ["priority", "Priority"], ["customer", "Customer"], ["lead", "Lead"], ["due_at", "Due at"], ["completed_at", "Completed at"], ["created_at", "Created at"],
  ],
  appointments: [
    ["lead_name", "Customer"], ["phone", "Phone"], ["vehicle_label", "Vehicle"], ["scheduled_for", "Scheduled for"], ["status", "Status"], ["responsible", "Responsible"], ["created_at", "Created at"],
  ],
} as const;

export async function GET(request: NextRequest) {
  const session = await requireSession();
  if (isDemoMode()) return Response.json({ error: "Preview data cannot be exported." }, { status: 409 });
  const type = request.nextUrl.searchParams.get("type") ?? "";
  if (!(type in exports)) return Response.json({ error: "Unknown export type." }, { status: 400 });
  const filters = Object.fromEntries(["q", "stage", "status", "priority", "mine", "overdue", "from", "to"].map((key) => [key, request.nextUrl.searchParams.get(key) ?? ""]));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_export", { p_dealer: session.dealer.id, p_type: type, p_filters: filters });
  if (error?.message.includes("export_too_large")) return Response.json({ error: "This export exceeds 5,000 rows. Narrow the filters and try again." }, { status: 413 });
  if (error || !Array.isArray(data)) return Response.json({ error: "You do not have permission to export this data." }, { status: 403 });
  const columns = exports[type as keyof typeof exports].map(([key, label]) => ({ key, label }));
  const csv = csvFromRows(columns, data as Record<string, CsvValue>[]);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(`\uFEFF${csv}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="autonexus-${type}-${date}.csv"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
