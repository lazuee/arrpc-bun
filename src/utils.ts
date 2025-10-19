import { color } from "bun";

export const rgb = (r: number, g: number, b: number, msg: string): string => {
	const ansiCode = color([r, g, b], "ansi-16m");
	return `${ansiCode}${msg}\x1b[0m`;
};

export const createLogger = (
	component: string,
	r: number,
	g: number,
	b: number,
) => {
	return (...args: unknown[]): void => {
		console.log(
			`[${rgb(88, 101, 242, "arRPC")} > ${rgb(r, g, b, component)}]`,
			...args,
		);
	};
};

export const log = (...args: unknown[]): void => {
	console.log(`[${rgb(88, 101, 242, "arRPC")}]`, ...args);
};
