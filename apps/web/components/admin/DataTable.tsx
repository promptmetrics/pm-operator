'use client';

import {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { ChevronUp, ChevronDown, MoreVertical, Square, CheckSquare } from 'lucide-react';

// ── Debounce hook ────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render: (row: T) => ReactNode;
}

export interface Action<T> {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  onClick: (row: T) => void;
}

export interface DataTableProps<T> {
  /** Column definitions */
  columns: Column<T>[];
  /** Row data */
  data: T[];
  /** Unique key accessor (defaults to "id") */
  rowKey?: keyof T | ((row: T) => string | number);
  // ── Sort ──
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (key: string, dir: 'asc' | 'desc') => void;
  // ── Search ──
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  searchPlaceholder?: string;
  // ── Filters ──
  filters?: { key: string; label: string; active: boolean }[];
  onFilterToggle?: (key: string) => void;
  // ── Row actions ──
  actions?: Action<T>[];
  // ── Bulk selection ──
  selectedIds?: Set<string | number>;
  onSelectionChange?: (ids: Set<string | number>) => void;
  // ── Pagination ──
  page?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
  // ── States ──
  loading?: boolean;
  emptyIcon?: ReactNode;
  emptyMessage?: string;
  // ── Row click ──
  onRowClick?: (row: T) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRowKey<T>(row: T, accessor: NonNullable<DataTableProps<T>['rowKey']>): string | number {
  if (typeof accessor === 'function') return accessor(row);
  return row[accessor] as unknown as string | number;
}

// ── Skeleton row ───────────────────────────────────────────────────────────────

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr className="animate-pulse border-b border-gray-100">
      <td className="px-4 py-3">
        <div className="h-4 w-4 rounded bg-gray-200" />
      </td>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 rounded bg-gray-200" style={{ width: `${60 + (i * 10) % 30}%` }} />
        </td>
      ))}
      <td className="px-4 py-3">
        <div className="h-4 w-6 rounded bg-gray-200" />
      </td>
    </tr>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  rowKey = 'id' as keyof T,
  sortKey,
  sortDir,
  onSort,
  searchQuery: controlledSearch,
  onSearchChange,
  searchPlaceholder = 'Search…',
  filters,
  onFilterToggle,
  actions,
  selectedIds,
  onSelectionChange,
  page,
  totalPages,
  onPageChange,
  hasMore,
  onLoadMore,
  loading = false,
  emptyIcon,
  emptyMessage = 'No data found.',
  onRowClick,
}: DataTableProps<T>) {
  // ── Internal search state (uncontrolled) ──
  const [localSearch, setLocalSearch] = useState('');
  const isSearchControlled = controlledSearch !== undefined;
  const searchValue = isSearchControlled ? controlledSearch : localSearch;
  const debouncedSearch = useDebounce(searchValue, 300);

  useEffect(() => {
    if (!isSearchControlled) {
      onSearchChange?.(debouncedSearch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // ── Action menu state ──
  const [openMenuRow, setOpenMenuRow] = useState<string | number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Click-outside dismissal
  useEffect(() => {
    if (openMenuRow === null) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuRow(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenuRow]);

  // ── Bulk selection helpers ──
  const rowKeyFn = useMemo(() => {
    if (typeof rowKey === 'function') return rowKey;
    return (row: T) => row[rowKey] as unknown as string | number;
  }, [rowKey]);

  const allRowIds = useMemo(() => data.map(rowKeyFn), [data, rowKeyFn]);

  const someSelected = useMemo(
    () => selectedIds !== undefined && selectedIds.size > 0 && selectedIds.size < data.length,
    [selectedIds, data.length],
  );

  const allSelected = useMemo(
    () => selectedIds !== undefined && data.length > 0 && selectedIds.size === data.length,
    [selectedIds, data.length],
  );

  const toggleAll = useCallback(() => {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(allRowIds));
    }
  }, [allSelected, allRowIds, onSelectionChange]);

  const toggleOne = useCallback(
    (id: string | number) => {
      if (!onSelectionChange || !selectedIds) return;
      const next = new Set(selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onSelectionChange(next);
    },
    [selectedIds, onSelectionChange],
  );

  // ── Sort click ──
  const handleSort = useCallback(
    (key: string) => {
      if (!onSort) return;
      const nextDir = sortKey === key && sortDir === 'asc' ? 'desc' : 'asc';
      onSort(key, nextDir);
    },
    [onSort, sortKey, sortDir],
  );

  // ── Render ──
  return (
    <div className="w-full">
      {/* ── Toolbar: search + filters ── */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={searchValue}
          onChange={(e) => {
            if (isSearchControlled) onSearchChange?.(e.target.value);
            else setLocalSearch(e.target.value);
          }}
          placeholder={searchPlaceholder}
          className="h-9 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-gray-400"
        />

        {filters && onFilterToggle && (
          <div className="flex flex-wrap items-center gap-2">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => onFilterToggle(f.key)}
                className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
                style={{
                  backgroundColor: f.active ? 'var(--pm-coral, #f97316)' : '#f3f4f6',
                  color: f.active ? '#fff' : '#374151',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Table ── */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full table-auto text-left text-sm">
          {/* ── Header ── */}
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
              {/* Bulk-select checkbox */}
              <th className="w-10 px-4 py-3">
                {onSelectionChange && (
                  <button onClick={toggleAll} className="text-gray-400 hover:text-gray-600">
                    {allSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                  </button>
                )}
              </th>

              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 ${col.sortable && onSort ? 'cursor-pointer select-none hover:text-gray-700' : ''}`}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable && sortKey === col.key && (
                      sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </span>
                </th>
              ))}

              {/* Actions header (spacer) */}
              {actions && actions.length > 0 && <th className="w-12 px-4 py-3" />}
            </tr>
          </thead>

          {/* ── Body ── */}
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={i} cols={columns.length} />
              ))
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (onSelectionChange ? 2 : 1)}
                  className="px-4 py-16 text-center"
                >
                  <div className="flex flex-col items-center gap-2 text-gray-400">
                    {emptyIcon}
                    <span className="text-sm">{emptyMessage}</span>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((row) => {
                const id = rowKeyFn(row);
                const isSelected = selectedIds?.has(id) ?? false;
                const isMenuOpen = openMenuRow === id;

                return (
                  <tr
                    key={id}
                    onClick={() => onRowClick?.(row)}
                    className={`border-b border-gray-100 transition-colors last:border-0 hover:bg-gray-50 ${
                      onRowClick ? 'cursor-pointer' : ''
                    }`}
                  >
                    {/* Bulk-select checkbox */}
                    <td className="px-4 py-3">
                      {onSelectionChange && (
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleOne(id); }}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                        </button>
                      )}
                    </td>

                    {columns.map((col) => (
                      <td key={col.key} className="px-4 py-3 text-gray-700">
                        {col.render(row)}
                      </td>
                    ))}

                    {/* Row actions menu */}
                    {actions && actions.length > 0 && (
                      <td className="relative px-4 py-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuRow(isMenuOpen ? null : id);
                          }}
                          className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                        >
                          <MoreVertical size={16} />
                        </button>

                        {isMenuOpen && (
                          <div
                            ref={menuRef}
                            className="absolute right-4 top-full z-50 min-w-[140px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
                          >
                            {actions.map((action, i) => (
                              <button
                                key={i}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  action.onClick(row);
                                  setOpenMenuRow(null);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50"
                                style={{
                                  color: action.danger ? 'var(--pm-danger, #dc2626)' : '#374151',
                                }}
                              >
                                {action.icon}
                                {action.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {(totalPages !== undefined || hasMore !== undefined) && (
        <div className="mt-3 flex items-center justify-between text-sm text-gray-500">
          <span>
            Page {page ?? 1}
            {totalPages !== undefined && ` / ${totalPages}`}
          </span>

          <div className="flex items-center gap-2">
            {onPageChange && page !== undefined && (
              <>
                <button
                  disabled={page <= 1}
                  onClick={() => onPageChange(page - 1)}
                  className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 enabled:hover:bg-gray-50"
                >
                  Previous
                </button>
                <button
                  disabled={totalPages !== undefined ? page >= totalPages : false}
                  onClick={() => onPageChange(page + 1)}
                  className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 enabled:hover:bg-gray-50"
                >
                  Next
                </button>
              </>
            )}

            {onLoadMore && hasMore && (
              <button
                onClick={onLoadMore}
                className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium transition-colors hover:bg-gray-50"
              >
                Load more
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
