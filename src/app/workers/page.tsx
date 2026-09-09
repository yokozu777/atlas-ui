import { redirect } from "next/navigation";

export default function WorkersPage() {
  redirect("/settings?tab=workers");
}
