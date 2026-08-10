'use client';

import {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import {
  ChevronUp,
  ChevronDown,
  MinusSquare,
  MoreVertical,
  Square,
  CheckSquare,
} from 'lucide-react';

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
  /** Right-align the header and cells — for numeric or trailing action columns. */
  align?: 'left' | 'right';
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
  /**
   * Accessible name for the table. Rendered as a visually hidden <caption> and
   * used to label the horizontal scroll region so keyboard users can reach it.
   */
  caption?: string;
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

// ── Shared cell metrics ───────────────────────────────────────────────────────

const HEAD_CELL =
  'whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--pm-muted)]';
const BODY_CELL = 'px-4 py-3.5 align-middle text-sm text-[var(--pm-ink-2)]';
const ZEBRA =
  'even:bg-[color-mix(in_srgb,var(--pm-paper-2)_38%,var(--pm-paper-inset))]';
const ROW_HOVER = 'hover:bg-[var(--pm-paper-2)]';
const ICON_BUTTON =
  'rounded-[var(--pm-radius-sm)] text-[var(--pm-muted)] transition-colors hover:text-[var(--pm-ink)] focus-visible:outline-none focus-visible:shadow-[var(--pm-focus)]';
const PAGER_BUTTON =
  'rounded-[var(--pm-radius-md)] border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-3 py-1.5 text-xs font-medium text-[var(--pm-ink-2)] transition-colors disabled:cursor-not-allowed disabled:opacity-40 enabled:hover:bg-[var(--pm-paper-2)] focus-visible:outline-none focus-visible:shadow-[var(--pm-focus)]';

/**
 * Outline chip for in-row actions (View / Revoke links and buttons) per the
 * moderation-admin reference table pattern — replaces filled secondary buttons.
 */
export const TABLE_ACTION_CHIP =
  'inline-flex h-7 items-center justify-center whitespace-nowrap rounded-[var(--pm-radius-pill)] border border-[var(--pm-line)] bg-transparent px-3 text-xs font-medium text-[var(--pm-ink-2)] transition-colors hover:bg-[var(--pm-paper-2)] hover:text-[var(--pm-ink)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:shadow-[var(--pm-focus)]';

// ── Skeleton row ───────────────────────────────────────────────────────────────

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr className="animate-pulse border-b border-[var(--pm-line)] last:border-0">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className={BODY_CELL}>
          <div
            className="h-4 rounded-[var(--pm-radius-xs)] bg-[var(--pm-paper-2)]"
            style={{ width: `${60 + ((i * 10) % 30)}%` }}
          />
        </td>
      ))}
    </tr>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  rowKey = 'id' as keyof T,
  caption,
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

  // ── Derived layout ──
  const selectable = Boolean(onSelectionChange);
  const hasActions = Boolean(actions && actions.length > 0);
  const hasSearch = Boolean(onSearchChange);
  const hasFilters = Boolean(filters && onFilterToggle);
  const columnCount = columns.length + (selectable ? 1 : 0) + (hasActions ? 1 : 0);

  // ── Render ──
  return (
    <div className="w-full">
      {/* ── Toolbar: search + filters. Rendered only when wired up by the page. ── */}
      {(hasSearch || hasFilters) && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          {hasSearch && (
            <input
              type="search"
              value={searchValue}
              aria-label={searchPlaceholder}
              onChange={(e) => {
                if (isSearchControlled) onSearchChange?.(e.target.value);
                else setLocalSearch(e.target.value);
              }}
              placeholder={searchPlaceholder}
              className="h-10 min-w-0 flex-1 rounded-[var(--pm-radius-md)] border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-3 text-sm text-[var(--pm-ink)] placeholder-[var(--pm-muted-soft)] outline-none focus-visible:shadow-[var(--pm-focus)]"
            />
          )}

          {filters && onFilterToggle && (
            <div className="flex flex-wrap items-center gap-2">
              {filters.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={f.active}
                  onClick={() => onFilterToggle(f.key)}
                  className={`rounded-[var(--pm-radius-pill)] border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:shadow-[var(--pm-focus)] ${
                    f.active
                      ? 'border-[var(--pm-coral)] bg-[var(--pm-coral)] text-[var(--pm-coral-ink)]'
                      : 'border-[var(--pm-line)] bg-[var(--pm-paper-inset)] text-[var(--pm-ink-2)] hover:bg-[var(--pm-paper-2)]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Table. The scroll lives here so the page body never scrolls sideways. ── */}
      <div
        className="w-full overflow-x-auto rounded-[var(--pm-radius-lg)] border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] focus-visible:outline-none focus-visible:shadow-[var(--pm-focus)]"
        {...(caption ? { role: 'region', 'aria-label': caption, tabIndex: 0 } : {})}
      >
        {/* min-w keeps the columns legible on narrow viewports; the wrapper
            above scrolls rather than the page. */}
        <table className="w-full min-w-[48rem] table-auto border-collapse text-left text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}

          {/* ── Header ── */}
          <thead>
            <tr className="border-b border-[var(--pm-line-2)] bg-[var(--pm-paper-2)]">
              {/* Bulk-select checkbox */}
              {selectable && (
                <th scope="col" className={`${HEAD_CELL} w-10`}>
                  <button
                    type="button"
                    onClick={toggleAll}
                    aria-label="Select all rows"
                    aria-pressed={someSelected ? 'mixed' : allSelected}
                    className={ICON_BUTTON}
                  >
                    {allSelected ? (
                      <CheckSquare size={16} />
                    ) : someSelected ? (
                      <MinusSquare size={16} />
                    ) : (
                      <Square size={16} />
                    )}
                  </button>
                </th>
              )}

              {columns.map((col) => {
                const sorted = col.sortable && sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={
                      col.sortable
                        ? sorted
                          ? sortDir === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                        : undefined
                    }
                    className={`${HEAD_CELL} ${col.align === 'right' ? 'text-right' : ''}`}
                  >
                    {col.sortable && onSort ? (
                      <button
                        type="button"
                        onClick={() => handleSort(col.key)}
                        className={`inline-flex items-center gap-1 rounded-[var(--pm-radius-sm)] uppercase tracking-[0.07em] transition-colors hover:text-[var(--pm-ink)] focus-visible:outline-none focus-visible:shadow-[var(--pm-focus)] ${
                          sorted ? 'text-[var(--pm-ink)]' : ''
                        }`}
                      >
                        {col.label}
                        {sorted ? (
                          sortDir === 'asc' ? (
                            <ChevronUp size={14} aria-hidden="true" />
                          ) : (
                            <ChevronDown size={14} aria-hidden="true" />
                          )
                        ) : null}
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                );
              })}

              {/* Actions header */}
              {hasActions && (
                <th scope="col" className={`${HEAD_CELL} w-12 text-right`}>
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>

          {/* ── Body ── */}
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={i} cols={columnCount} />
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="px-4 py-16 text-center">
                  <div className="flex flex-col items-center gap-2">
                    {emptyIcon && (
                      <span className="text-[var(--pm-muted-soft)]">{emptyIcon}</span>
                    )}
                    <span className="text-sm text-[var(--pm-muted)]">{emptyMessage}</span>
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
                    className={`border-b border-[var(--pm-line)] transition-colors last:border-0 ${ZEBRA} ${ROW_HOVER} ${
                      onRowClick ? 'cursor-pointer' : ''
                    } ${isSelected ? 'bg-[var(--pm-coral-tint-10)]' : ''}`}
                  >
                    {/* Bulk-select checkbox */}
                    {selectable && (
                      <td className={BODY_CELL}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleOne(id);
                          }}
                          aria-label="Select row"
                          aria-pressed={isSelected}
                          className={ICON_BUTTON}
                        >
                          {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                        </button>
                      </td>
                    )}

                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`${BODY_CELL} ${col.align === 'right' ? 'text-right' : ''}`}
                      >
                        {col.render(row)}
                      </td>
                    ))}

                    {/* Row actions menu */}
                    {hasActions && (
                      <td className={`${BODY_CELL} relative text-right`}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuRow(isMenuOpen ? null : id);
                          }}
                          aria-label="Row actions"
                          aria-haspopup="true"
                          aria-expanded={isMenuOpen}
                          className={`${ICON_BUTTON} p-1 hover:bg-[var(--pm-paper-3)]`}
                        >
                          <MoreVertical size={16} aria-hidden="true" />
                        </button>

                        {isMenuOpen && (
                          <div
                            ref={menuRef}
                            className="absolute right-4 top-full z-50 min-w-[150px] rounded-[var(--pm-radius-md)] border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] py-1 text-left shadow-[var(--pm-shadow-lg)]"
                          >
                            {actions!.map((action, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  action.onClick(row);
                                  setOpenMenuRow(null);
                                }}
                                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--pm-paper-2)] focus-visible:outline-none focus-visible:shadow-[var(--pm-focus)] ${
                                  action.danger
                                    ? 'text-[var(--pm-danger)]'
                                    : 'text-[var(--pm-ink-2)]'
                                }`}
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
        <nav
          aria-label="Pagination"
          className="mt-3 flex items-center justify-between text-sm text-[var(--pm-muted)]"
        >
          <span>
            Page {page ?? 1}
            {totalPages !== undefined && ` / ${totalPages}`}
          </span>

          <div className="flex items-center gap-2">
            {onPageChange && page !== undefined && (
              <>
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => onPageChange(page - 1)}
                  className={PAGER_BUTTON}
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={totalPages !== undefined ? page >= totalPages : false}
                  onClick={() => onPageChange(page + 1)}
                  className={PAGER_BUTTON}
                >
                  Next
                </button>
              </>
            )}

            {onLoadMore && hasMore && (
              <button type="button" onClick={onLoadMore} className={PAGER_BUTTON}>
                Load more
              </button>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
