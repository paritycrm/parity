import Link from "next/link";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  baseUrl: string;
  searchParams?: Record<string, string>;
}

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  baseUrl,
  searchParams = {},
}: PaginationProps) {
  if (totalPages <= 1) return null;

  function buildUrl(page: number) {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(page));
    return `${baseUrl}?${params.toString()}`;
  }

  // Show a window of pages around the current page
  const windowSize = 5;
  let startPage = Math.max(1, currentPage - Math.floor(windowSize / 2));
  const endPage = Math.min(totalPages, startPage + windowSize - 1);
  if (endPage - startPage + 1 < windowSize) {
    startPage = Math.max(1, endPage - windowSize + 1);
  }

  const pages: number[] = [];
  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex items-center justify-between border-t border-gray-200 pt-4 mt-4">
      <p className="text-sm text-gray-600">
        Showing <span className="font-medium">{startItem}</span> to{" "}
        <span className="font-medium">{endItem}</span> of{" "}
        <span className="font-medium">{totalItems.toLocaleString()}</span> results
      </p>

      <nav className="flex items-center gap-1">
        {/* First page */}
        {currentPage > 2 && (
          <Link
            href={buildUrl(1)}
            className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            title="First page"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Link>
        )}

        {/* Previous page */}
        {currentPage > 1 ? (
          <Link
            href={buildUrl(currentPage - 1)}
            className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            title="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
        ) : (
          <span className="p-1.5 rounded text-gray-200">
            <ChevronLeft className="h-4 w-4" />
          </span>
        )}

        {/* Page numbers */}
        {startPage > 1 && (
          <span className="px-1 text-gray-400 text-sm">...</span>
        )}
        {pages.map((page) => (
          <Link
            key={page}
            href={buildUrl(page)}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              page === currentPage
                ? "brand-btn-primary text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {page}
          </Link>
        ))}
        {endPage < totalPages && (
          <span className="px-1 text-gray-400 text-sm">...</span>
        )}

        {/* Next page */}
        {currentPage < totalPages ? (
          <Link
            href={buildUrl(currentPage + 1)}
            className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            title="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        ) : (
          <span className="p-1.5 rounded text-gray-200">
            <ChevronRight className="h-4 w-4" />
          </span>
        )}

        {/* Last page */}
        {currentPage < totalPages - 1 && (
          <Link
            href={buildUrl(totalPages)}
            className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            title="Last page"
          >
            <ChevronsRight className="h-4 w-4" />
          </Link>
        )}
      </nav>
    </div>
  );
}
