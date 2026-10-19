import { redirect } from "next/navigation";

export default async function NewVehiclePage() {
  redirect("/business/purchases/new");
}
