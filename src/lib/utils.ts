export { cn } from "tailwind-variants";

type EnvVar = keyof NodeJS.ProcessEnv;

/** Reads an integer from environment variables, returning the default if missing or invalid. */
export function envInt(key: EnvVar, defaultValue: number): number {
	const value = process.env[key];
	if (!value) return defaultValue;
	const parsed = parseInt(value, 10);
	return Number.isNaN(parsed) ? defaultValue : parsed;
}

/** Reads an integer from environment variables, returning the default outside `min` to `max`. */
export function envIntBetween(
	key: EnvVar,
	defaultValue: number,
	min: number,
	max: number,
): number {
	const parsed = envInt(key, defaultValue);
	return parsed >= min && parsed <= max ? parsed : defaultValue;
}

/** Reads a string from environment variables, returning the default if missing. */
export function envString(key: EnvVar, defaultValue: string): string {
	return process.env[key] || defaultValue;
}

export type WithoutChild<T> = T extends { child?: unknown } ? Omit<T, "child"> : T;
export type WithoutChildren<T> = T extends { children?: unknown } ? Omit<T, "children"> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };
