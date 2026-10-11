/**
 * Keyset pagination for `/api/v1` lists. The cursor is the id of the last row on the
 * previous page; queries compare against that row's sort key in SQL, so timestamps keep
 * Postgres' microsecond precision instead of passing through a JS `Date`.
 */

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export interface PageRequest {
	limit: number;
	/** Id of the last row already returned, or null for the first page. */
	after: string | null;
}

export interface Page<T> {
	data: T[];
	nextCursor: string | null;
}

/** The page asked for in `params`, or why the request is invalid. */
export function parsePage(params: URLSearchParams): PageRequest | string {
	const rawLimit = params.get("limit");
	let limit = DEFAULT_PAGE_SIZE;
	if (rawLimit !== null) {
		limit = Number(rawLimit);
		if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
			return `limit must be a whole number from 1 to ${MAX_PAGE_SIZE}`;
		}
	}

	const after = params.get("cursor");
	if (after === "") return "cursor must not be empty";

	return { limit, after };
}

/** Builds a page from `limit + 1` fetched rows: the extra row only signals that more exist. */
export function toPage<T extends { id: string }>(rows: T[], limit: number): Page<T> {
	const data = rows.slice(0, limit);
	return { data, nextCursor: rows.length > limit ? (data.at(-1)?.id ?? null) : null };
}
