"use client";

import { useState, useRef, useTransition } from "react";
import { Send, Mail, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TeamMember {
  id: string;
  name: string;
  email: string;
}

interface Comment {
  id: string;
  content: string;
  isEmail: boolean;
  emailTo: string | null;
  emailSubject: string | null;
  createdAt: string;
  author: { id: string; name: string };
  mentions: { user: { id: string; name: string } }[];
  attachments: { id: string; fileName: string; fileSize: number }[];
}

export function GrantComments({
  comments,
  grantId,
  contactEmail,
  contactPerson,
  teamMembers,
  currentUserId,
  addCommentAction,
  sendEmailAction,
}: {
  comments: Comment[];
  grantId: string;
  contactEmail: string | null;
  contactPerson: string | null;
  teamMembers: TeamMember[];
  currentUserId: string;
  addCommentAction: (formData: FormData) => Promise<void>;
  sendEmailAction: (formData: FormData) => Promise<void>;
}) {
  const [content, setContent] = useState("");
  const [isEmailMode, setIsEmailMode] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const filteredMembers = teamMembers.filter(
    (m) =>
      m.id !== currentUserId &&
      m.name.toLowerCase().includes(mentionFilter.toLowerCase())
  );

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setContent(val);

    // Check for @ trigger
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);
    if (atMatch) {
      setShowMentions(true);
      setMentionFilter(atMatch[1]);
    } else {
      setShowMentions(false);
    }
  }

  function insertMention(member: TeamMember) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = content.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf("@");
    const before = content.slice(0, atIndex);
    const after = content.slice(cursorPos);
    const newContent = `${before}@${member.name} ${after}`;

    setContent(newContent);
    setShowMentions(false);
    if (!mentionIds.includes(member.id)) {
      setMentionIds([...mentionIds, member.id]);
    }
    textarea.focus();
  }

  function handleSubmit() {
    if (!content.trim()) return;

    const formData = new FormData();
    formData.set("grantId", grantId);
    formData.set("content", content);
    formData.set("mentionIds", JSON.stringify(mentionIds));

    if (isEmailMode) {
      formData.set("emailSubject", emailSubject);
      startTransition(() => sendEmailAction(formData));
    } else {
      startTransition(() => addCommentAction(formData));
    }

    setContent("");
    setEmailSubject("");
    setMentionIds([]);
    setIsEmailMode(false);
  }

  function renderContent(text: string) {
    // Highlight @mentions in the text
    return text.replace(/@(\w+(?:\s\w+)?)/g, '<span class="text-indigo-600 font-medium">@$1</span>');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Correspondence</h3>
        {contactEmail && (
          <Button
            variant={isEmailMode ? "default" : "outline"}
            size="sm"
            onClick={() => setIsEmailMode(!isEmailMode)}
          >
            <Mail className="h-4 w-4 mr-2" />
            {isEmailMode ? "Cancel Email" : `Email ${contactPerson || contactEmail}`}
          </Button>
        )}
      </div>

      {/* Comment thread */}
      <div className="space-y-3 max-h-[500px] overflow-y-auto">
        {comments.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">
            No correspondence yet. Add a note or send an email to the grant contact.
          </p>
        ) : (
          comments.map((comment) => (
            <div
              key={comment.id}
              className={`p-3 rounded-lg border ${
                comment.isEmail
                  ? "border-blue-200 bg-blue-50"
                  : "border-gray-200 bg-white"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">
                    {comment.author.name}
                  </span>
                  {comment.isEmail && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                      Email to {comment.emailTo}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-500">
                  {new Date(comment.createdAt).toLocaleString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              {comment.isEmail && comment.emailSubject && (
                <p className="text-xs text-gray-500 mb-1">
                  Subject: {comment.emailSubject}
                </p>
              )}
              <div
                className="text-sm text-gray-700 whitespace-pre-wrap"
                dangerouslySetInnerHTML={{ __html: renderContent(comment.content) }}
              />
              {comment.attachments.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {comment.attachments.map((att) => (
                    <span
                      key={att.id}
                      className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded flex items-center gap-1"
                    >
                      <Paperclip className="h-3 w-3" />
                      {att.fileName}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Compose area */}
      <div className="border border-gray-200 rounded-lg">
        {isEmailMode && (
          <div className="px-3 pt-3">
            <div className="text-xs text-gray-500 mb-1">
              To: {contactPerson} &lt;{contactEmail}&gt;
            </div>
            <input
              type="text"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              placeholder="Subject..."
              className="w-full text-sm border-0 border-b border-gray-200 pb-2 focus:outline-none focus:ring-0"
            />
          </div>
        )}
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleInput}
            placeholder={
              isEmailMode
                ? "Write your email... Use @name to mention team members"
                : "Add a note... Use @name to mention team members"
            }
            className="w-full px-3 py-3 text-sm border-0 resize-none focus:outline-none focus:ring-0 min-h-[80px]"
            rows={3}
          />

          {/* @mention dropdown */}
          {showMentions && filteredMembers.length > 0 && (
            <div className="absolute bottom-full left-3 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto z-10 w-64">
              {filteredMembers.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between"
                  onClick={() => insertMention(member)}
                >
                  <span className="font-medium">{member.name}</span>
                  <span className="text-xs text-gray-400">{member.email}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100">
          <div className="text-xs text-gray-400">
            Type @ to mention a team member
          </div>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!content.trim() || isPending}
          >
            <Send className="h-4 w-4 mr-2" />
            {isEmailMode ? "Send Email" : "Add Note"}
          </Button>
        </div>
      </div>
    </div>
  );
}
