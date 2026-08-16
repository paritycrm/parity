import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { RegistrationFormClient } from "./registration-form";

export default async function PublicRegistrationPage({
  params,
}: {
  params: Promise<{ formId: string }>;
}) {
  const { formId } = await params;

  const form = await prisma.eventRegistrationForm.findUnique({
    where: { id: formId },
    include: {
      event: true,
      items: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!form || !form.isActive) notFound();

  // Serialize for client component
  const formData = {
    id: form.id,
    title: form.title,
    description: form.description,
    logoUrl: form.logoUrl,
    primaryColor: form.primaryColor,
    accentColor: form.accentColor,
    headerText: form.headerText,
    thankYouMessage: form.thankYouMessage,
    requiresPayment: form.requiresPayment,
    allowDonations: form.allowDonations,
    collectPhone: form.collectPhone,
    collectAddress: form.collectAddress,
    giftAidEnabled: form.giftAidEnabled,
    stripeEnabled: form.stripeEnabled,
    goCardlessEnabled: form.goCardlessEnabled,
    event: {
      id: form.event.id,
      name: form.event.name,
      description: form.event.description,
      startDate: form.event.startDate.toISOString(),
      endDate: form.event.endDate?.toISOString() || null,
      location: form.event.location,
    },
    items: form.items.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      type: item.type,
      price: item.price ? Number(item.price) : null,
      isRequired: item.isRequired,
      isGiftAidEligible: item.isGiftAidEligible,
      maxQuantity: item.maxQuantity,
      options: item.options,
      imageUrl: item.imageUrl,
    })),
  };

  return <RegistrationFormClient form={formData} />;
}
