import { color } from "bun";

import { ARRPC_BRAND_COLOR } from "./constants";

const colorCache = new Map<string, string>();

function getCachedColor(r: number, g: number, b: number): string {
	const key = `${r},${g},${b}`;
	const cached = colorCache.get(key);
	if (cached !== undefined) {
		return cached;
	}
	const newColor = color([r, g, b], "ansi-16m") ?? "";
	colorCache.set(key, newColor);
	return newColor;
}

export function rgb(r: number, g: number, b: number, msg: string): string {
	const ansiCode = getCachedColor(r, g, b);
	return `${ansiCode}${msg}\x1b[0m`;
}

export function createLogger(
	component: string,
	r: number,
	g: number,
	b: number,
) {
	const brandPrefix = rgb(...ARRPC_BRAND_COLOR, "arRPC");
	const componentPrefix = rgb(r, g, b, component);
	const fullPrefix = `[${brandPrefix} > ${componentPrefix}]`;

	return (...args: unknown[]): void => {
		console.log(fullPrefix, ...args);
	};
}

const mainLogPrefix = `[${rgb(...ARRPC_BRAND_COLOR, "arRPC")}]`;

export function log(...args: unknown[]): void {
	console.log(mainLogPrefix, ...args);
}
