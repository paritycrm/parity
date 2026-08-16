import { redirect } from "next/navigation";

export default function VolunteersPage() {
  redirect("/crm/contacts?type=VOLUNTEER");
}
