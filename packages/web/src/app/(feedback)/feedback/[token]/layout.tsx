export default function FeedbackLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#1b3a2d] text-white">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 bg-white/20 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">P</span>
            </div>
            <span className="font-semibold">Parity CRM</span>
            <span className="text-white/60 text-sm ml-2">Volunteer Feedback</span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white mt-auto">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
          <p className="text-xs text-gray-400 text-center">
            Parity CRM &mdash; Volunteer Feedback
          </p>
        </div>
      </footer>
    </div>
  );
}
