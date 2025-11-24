import { color, env } from "bun";

import { ARRPC_BRAND_COLOR, ENV_DEBUG } from "./constants";

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
	const basePrefix = `[${brandPrefix} > ${componentPrefix}]`;

	return (...args: unknown[]): void => {
		if (env[ENV_DEBUG]) {
			const timestamp = new Date()
				.toISOString()
				.split("T")[1]
				?.slice(0, -1);
			console.log(`${timestamp} ${basePrefix}`, ...args);
		} else {
			console.log(basePrefix, ...args);
		}
	};
}

const mainLogPrefix = `[${rgb(...ARRPC_BRAND_COLOR, "arRPC")}]`;

export function log(...args: unknown[]): void {
	console.log(mainLogPrefix, ...args);
}

export function normalizeTimestamps(
	timestamps: Record<string, number> | undefined,
): void {
	if (!timestamps) return;

	for (const x in timestamps) {
		const key = x as keyof typeof timestamps;
		const value = timestamps[key];
		if (value) {
			if (value < 10000000000) {
				timestamps[key] = value * 1000;
			} else if (value > 10000000000000) {
				timestamps[key] = Math.floor(value / 1000);
			}
		}
	}
}

export function formatDuration(startTime: number): string {
	const elapsed = Date.now() - startTime;
	const minutes = Math.floor(elapsed / 60000);
	const hours = Math.floor(minutes / 60);
	if (hours > 0) {
		return `running for ${hours}h ${minutes % 60}m`;
	}
	return `running for ${minutes}m`;
}

export function getPortRange(
	normalRange: [number, number],
	hyperVRange: [number, number],
	useHyperV: boolean,
): [number, number] {
	return useHyperV ? hyperVRange : normalRange;
}
