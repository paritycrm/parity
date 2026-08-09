"use client";

import { Bell, Search } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
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
      {/* Search */}
      <div className="flex items-center gap-2 flex-1 max-w-lg">
        <Search className="h-5 w-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search contacts, volunteers, broadcasts..."
          className="flex-1 border-0 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0"
        />
      </div>

      {/* Right side */}
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
