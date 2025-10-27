import { color } from "bun";

import { ARRPC_BRAND_COLOR } from "./constants";

export function rgb(r: number, g: number, b: number, msg: string): string {
	const ansiCode = color([r, g, b], "ansi-16m");
	return `${ansiCode}${msg}\x1b[0m`;
}

export function createLogger(
	component: string,
	r: number,
	g: number,
	b: number,
) {
	return (...args: unknown[]): void => {
		console.log(
			`[${rgb(...ARRPC_BRAND_COLOR, "arRPC")} > ${rgb(r, g, b, component)}]`,
			...args,
		);
	};
}

export function log(...args: unknown[]): void {
	console.log(`[${rgb(...ARRPC_BRAND_COLOR, "arRPC")}]`, ...args);
}
