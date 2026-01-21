import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merges class names with Tailwind-aware conflict resolution. */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/** Reads an integer from environment variables, returning the default if missing or invalid. */
export function envInt(key: string, defaultValue: number): number {
	const value = process.env[key];
	if (!value) return defaultValue;
	const parsed = parseInt(value, 10);
	return Number.isNaN(parsed) ? defaultValue : parsed;
}

/** Reads a string from environment variables, returning the default if missing. */
export function envString(key: string, defaultValue: string): string {
	return process.env[key] || defaultValue;
}

export type WithoutChild<T> = T extends { child?: unknown } ? Omit<T, "child"> : T;
export type WithoutChildren<T> = T extends { children?: unknown } ? Omit<T, "children"> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };
