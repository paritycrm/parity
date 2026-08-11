"use client";

import { Bell } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { SearchCommand } from "@/components/shared/search-command";
import Link from "next/link";

interface TopBarProps {
  user: {
    name: string;
    email: string;
    role: string;
  };
  notificationCount?: number;
}

export function TopBar({ user, notificationCount = 0 }: TopBarProps) {
  const [firstName, ...rest] = user.name.split(" ");
  const lastName = rest.join(" ") || "";

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      <SearchCommand />
      <div className="flex items-center gap-4">
        <Link
          href="/notifications"
          className="relative rounded-full p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <Bell className="h-5 w-5" />
          {notificationCount > 0 && (
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />
          )}
        </Link>
        <div className="flex items-center gap-3">
          <Avatar firstName={firstName} lastName={lastName} size="sm" />
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-gray-900">{user.name}</p>
            <p className="text-xs text-gray-500">{user.role}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
