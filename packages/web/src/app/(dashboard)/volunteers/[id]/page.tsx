import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function VolunteerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Look up the volunteer profile to find the associated contact
  const volunteer = await prisma.volunteerProfile.findUnique({
    where: { id },
    select: { contactId: true },
  });

  if (!volunteer) notFound();

  // Redirect to the unified CRM contact page
  redirect(`/crm/contacts/${volunteer.contactId}`);
}
