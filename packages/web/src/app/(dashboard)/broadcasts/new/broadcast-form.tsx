"use client";

import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";

interface Department {
  id: string;
  name: string;
}

interface Skill {
  id: string;
  name: string;
  departmentId: string | null;
}

interface BroadcastFormProps {
  departments: Department[];
  skills: Skill[];
  createBroadcast: (formData: FormData) => Promise<void>;
}

export function BroadcastForm({ departments, skills, createBroadcast }: BroadcastFormProps) {
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");

  const filteredSkills = useMemo(() => {
    if (!selectedDepartmentId) {
      // "Any department" selected — show all skills
      return skills;
    }
    // Show skills belonging to the selected department OR skills with no department (universal)
    return skills.filter(
      (skill) => skill.departmentId === selectedDepartmentId || skill.departmentId === null
    );
  }, [selectedDepartmentId, skills]);

  return (
    <Card>
      <CardContent className="pt-6">
        <form action={createBroadcast} className="space-y-6">
          <Input label="Title" name="title" required placeholder="e.g. Urgent: Kitchen cover needed" />
          <Textarea label="Message" name="message" required placeholder="Describe what's needed and why..." />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Urgency</label>
              <select name="urgency" required className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Department</label>
              <select
                name="departmentId"
                value={selectedDepartmentId}
                onChange={(e) => setSelectedDepartmentId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Any department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Input label="Date Needed" name="targetDate" type="date" required />
            <Input label="Start Time" name="targetStartTime" type="time" required />
            <Input label="End Time" name="targetEndTime" type="time" required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="People Needed" name="maxRespondents" type="number" min="1" defaultValue="1" />
            <Input label="Expires in (hours)" name="expiresInHours" type="number" min="1" defaultValue="4" />
          </div>

          {filteredSkills.length > 0 && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Required Skills</label>
              <p className="text-xs text-gray-500">Only volunteers with these skills will be notified</p>
              {selectedDepartmentId && (
                <p className="text-xs text-indigo-600">
                  Showing skills for the selected department and universal skills
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                {filteredSkills.map((skill) => (
                  <label key={skill.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="skills" value={skill.id} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                    <span>{skill.name}</span>
                    {!skill.departmentId && selectedDepartmentId && (
                      <span className="text-xs text-gray-400">(all depts)</span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}

          {skills.length > 0 && filteredSkills.length === 0 && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Required Skills</label>
              <p className="text-sm text-gray-500 py-4 text-center">No skills available for the selected department</p>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Link href="/broadcasts">
              <Button variant="outline" type="button">Cancel</Button>
            </Link>
            <Button type="submit" className="bg-red-600 hover:bg-red-700">Send Broadcast</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
