import { notFound } from "next/navigation";
import { requireAdministrator } from "@/lib/mundialito/admin/server";
/** Future subroutes remain protected even before their modules exist. */
export default async function PrivateNotFound() {
  await requireAdministrator();
  notFound();
}
