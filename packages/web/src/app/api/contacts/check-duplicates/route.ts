// packages/web/src/app/api/contacts/check-duplicates/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

type MatchType = "EMAIL" | "NAME_POSTCODE" | "PHONE" | "NAME_SIMILAR";
type Confidence = "HIGH" | "MEDIUM" | "LOW";

interface DuplicateMatch {
  id: string;
  donorId: number | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  postcode: string | null;
  matchType: MatchType;
  confidence: Confidence;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { firstName, lastName, email, phone, postcode } = body;

    if (!firstName && !lastName) {
      return NextResponse.json(
        { error: "At least first name or last name is required" },
        { status: 400 }
      );
    }

    const matchMap = new Map<string, DuplicateMatch>();

    // 1. Exact email match (highest confidence)
    if (email && email.trim()) {
      const emailMatches = await prisma.contact.findMany({
        where: {
          isArchived: false,
          email: { equals: email.trim(), mode: "insensitive" },
        },
        select: {
          id: true,
          donorId: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          postcode: true,
        },
        take: 5,
      });

      for (const contact of emailMatches) {
        matchMap.set(contact.id, {
          ...contact,
          matchType: "EMAIL",
          confidence: "HIGH",
        });
      }
    }

    // 2. Same firstName + lastName + postcode (high confidence)
    if (firstName && lastName && postcode && postcode.trim()) {
      const namePostcodeMatches = await prisma.contact.findMany({
        where: {
          isArchived: false,
          firstName: { equals: firstName.trim(), mode: "insensitive" },
          lastName: { equals: lastName.trim(), mode: "insensitive" },
          postcode: { equals: postcode.trim(), mode: "insensitive" },
        },
        select: {
          id: true,
          donorId: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          postcode: true,
        },
        take: 5,
      });

      for (const contact of namePostcodeMatches) {
        if (!matchMap.has(contact.id)) {
          matchMap.set(contact.id, {
            ...contact,
            matchType: "NAME_POSTCODE",
            confidence: "HIGH",
          });
        }
      }
    }

    // 3. Same phone or mobile (medium confidence)
    if (phone && phone.trim()) {
      const phoneMatches = await prisma.contact.findMany({
        where: {
          isArchived: false,
          OR: [
            { phone: { equals: phone.trim(), mode: "insensitive" } },
            { mobile: { equals: phone.trim(), mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          donorId: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          postcode: true,
        },
        take: 5,
      });

      for (const contact of phoneMatches) {
        if (!matchMap.has(contact.id)) {
          matchMap.set(contact.id, {
            ...contact,
            matchType: "PHONE",
            confidence: "MEDIUM",
          });
        }
      }
    }

    // 4. Similar firstName + lastName (low confidence, case-insensitive contains)
    if (firstName && lastName) {
      const nameMatches = await prisma.contact.findMany({
        where: {
          isArchived: false,
          firstName: { contains: firstName.trim(), mode: "insensitive" },
          lastName: { contains: lastName.trim(), mode: "insensitive" },
        },
        select: {
          id: true,
          donorId: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          postcode: true,
        },
        take: 10,
      });

      for (const contact of nameMatches) {
        if (!matchMap.has(contact.id)) {
          matchMap.set(contact.id, {
            ...contact,
            matchType: "NAME_SIMILAR",
            confidence: "LOW",
          });
        }
      }
    }

    // Return max 5 de-duplicated matches
    const matches = Array.from(matchMap.values()).slice(0, 5);

    return NextResponse.json({ matches });
  } catch (error) {
    console.error("Duplicate check failed:", error);
    return NextResponse.json(
      { error: "Duplicate check failed" },
      { status: 500 }
    );
  }
}
