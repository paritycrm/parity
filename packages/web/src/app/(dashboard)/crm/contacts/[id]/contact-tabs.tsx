"use client";

import { useState, type ReactNode } from "react";
import {
  FileText,
  MessageSquare,
  PoundSterling,
  UserCheck,
  GraduationCap,
  Clock,
  Wrench,
  Shield,
} from "lucide-react";

type TabId =
  | "overview"
  | "activity"
  | "donations"
  | "volunteer"
  | "training"
  | "hours"
  | "skills"
  | "compliance";

interface ContactTabsProps {
  overviewContent: ReactNode;
  activityContent: ReactNode;
  donationsContent: ReactNode;
  interactionCount: number;
  noteCount: number;
  donationCount: number;
  // Volunteer tabs (only rendered when isVolunteer=true)
  isVolunteer?: boolean;
  volunteerContent?: ReactNode;
  trainingContent?: ReactNode;
  hoursContent?: ReactNode;
  skillsDeptContent?: ReactNode;
  complianceContent?: ReactNode;
  trainingCount?: number;
  hoursCount?: number;
}

interface TabDef {
  id: TabId;
  label: string;
  icon: ReactNode;
  count?: number;
  group: "core" | "volunteer";
}

export function ContactTabs({
  overviewContent,
  activityContent,
  donationsContent,
  interactionCount,
  noteCount,
  donationCount,
  isVolunteer = false,
  volunteerContent,
  trainingContent,
  hoursContent,
  skillsDeptContent,
  complianceContent,
  trainingCount = 0,
  hoursCount = 0,
}: ContactTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const totalActivity = interactionCount + noteCount;

  const coreTabs: TabDef[] = [
    {
      id: "overview",
      label: "Overview",
      icon: <FileText className="h-4 w-4" />,
      group: "core",
    },
    {
      id: "donations",
      label: "Donations",
      icon: <PoundSterling className="h-4 w-4" />,
      count: donationCount,
      group: "core",
    },
    {
      id: "activity",
      label: "Activity",
      icon: <MessageSquare className="h-4 w-4" />,
      count: totalActivity,
      group: "core",
    },
  ];

  const volunteerTabs: TabDef[] = [
    {
      id: "volunteer",
      label: "Volunteer",
      icon: <UserCheck className="h-4 w-4" />,
      group: "volunteer",
    },
    {
      id: "training",
      label: "Training",
      icon: <GraduationCap className="h-4 w-4" />,
      count: trainingCount,
      group: "volunteer",
    },
    {
      id: "hours",
      label: "Hours",
      icon: <Clock className="h-4 w-4" />,
      count: hoursCount,
      group: "volunteer",
    },
    {
      id: "skills",
      label: "Skills & Depts",
      icon: <Wrench className="h-4 w-4" />,
      group: "volunteer",
    },
    {
      id: "compliance",
      label: "Compliance",
      icon: <Shield className="h-4 w-4" />,
      group: "volunteer",
    },
  ];

  const allTabs = isVolunteer ? [...coreTabs, ...volunteerTabs] : coreTabs;

  // Map tab IDs to their content
  const tabContent: Record<TabId, ReactNode> = {
    overview: overviewContent,
    donations: donationsContent,
    activity: activityContent,
    volunteer: volunteerContent ?? null,
    training: trainingContent ?? null,
    hours: hoursContent ?? null,
    skills: skillsDeptContent ?? null,
    compliance: complianceContent ?? null,
  };

  function tabButtonClass(tab: TabDef, isActive: boolean) {
    if (!isActive) {
      return "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300";
    }
    return tab.group === "volunteer"
      ? "border-indigo-600 text-indigo-600"
      : "border-teal-600 text-teal-600";
  }

  function badgeClass(tab: TabDef, isActive: boolean) {
    if (!isActive) {
      return "bg-gray-100 text-gray-600";
    }
    return tab.group === "volunteer"
      ? "bg-indigo-100 text-indigo-700"
      : "bg-teal-100 text-teal-700";
  }

  return (
    <div>
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex gap-8" aria-label="Contact tabs">
          {allTabs.map((tab, index) => {
            const isActive = activeTab === tab.id;
            // Insert a visual divider before the first volunteer tab
            const showDivider =
              isVolunteer &&
              tab.group === "volunteer" &&
              index > 0 &&
              allTabs[index - 1].group === "core";

            return (
              <div key={tab.id} className="flex items-center">
                {showDivider && (
                  <div className="h-6 w-px bg-gray-300 mr-8" aria-hidden="true" />
                )}
                <button
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center gap-2 py-3 px-1 text-sm font-medium border-b-2 transition-colors
                    ${tabButtonClass(tab, isActive)}
                  `}
                >
                  {tab.icon}
                  {tab.label}
                  {tab.count != null && tab.count > 0 && (
                    <span
                      className={`
                        ml-1 rounded-full px-2 py-0.5 text-xs font-medium
                        ${badgeClass(tab, isActive)}
                      `}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </nav>
      </div>

      {/* All tabs are rendered but only one is visible — preserves form state */}
      {allTabs.map((tab) => (
        <div key={tab.id} className={activeTab === tab.id ? "" : "hidden"}>
          {tabContent[tab.id]}
        </div>
      ))}
    </div>
  );
}
