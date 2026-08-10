import { redirect } from "next/navigation";

export default function CommunicationsRedirect({ searchParams }: { searchParams: { connected?: string; error?: string; view?: string } }) {
  const params = new URLSearchParams();
  if (searchParams.connected) params.set("connected", searchParams.connected);
  if (searchParams.error) params.set("error", searchParams.error);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  redirect(searchParams.view === "advanced" || searchParams.connected || searchParams.error ? `/email-settings${suffix}` : "/inbox");
}
