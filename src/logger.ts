import { color, env, stderr, stdout } from "bun";

import {
	ARRPC_BRAND_COLOR,
	ENV_DEBUG,
	LOG_COLOR_ERROR,
	LOG_COLOR_TIMESTAMP,
	LOG_COLOR_WARN,
} from "./constants";

function rgb(r: number, g: number, b: number, msg: string): string {
	return `${color([r, g, b], "ansi-16m")}${msg}\x1b[0m`;
}

function formatArgs(args: unknown[]): string {
	return args
		.map((arg) => {
			if (typeof arg === "string") return arg;
			if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
			return JSON.stringify(arg);
		})
		.join(" ");
}

const isDebug = env[ENV_DEBUG] !== undefined;
const brandPrefix = rgb(...ARRPC_BRAND_COLOR, "arRPC");

class Logger {
	private basePrefix: string;

	constructor(basePrefix: string) {
		this.basePrefix = basePrefix;
	}

	private write(args: unknown[], useStderr = false): void {
		const message = formatArgs(args);

		let output: string;
		if (isDebug) {
			const timestamp =
				new Date().toISOString().split("T")[1]?.slice(0, -1) ?? "";
			output = `${rgb(...LOG_COLOR_TIMESTAMP, timestamp)} ${this.basePrefix} ${message}\n`;
		} else {
			output = `${this.basePrefix} ${message}\n`;
		}

		(useStderr ? stderr : stdout).write(output);
	}

	debug(...args: unknown[]): void {
		if (isDebug) {
			this.write(args);
		}
	}

	info(...args: unknown[]): void {
		this.write(args);
	}

	warn(...args: unknown[]): void {
		this.write([rgb(...LOG_COLOR_WARN, "WARN"), ...args], true);
	}

	error(...args: unknown[]): void {
		this.write([rgb(...LOG_COLOR_ERROR, "ERROR"), ...args], true);
	}
}

export function createLogger(
	component: string,
	r: number,
	g: number,
	b: number,
): Logger {
	const componentPrefix = rgb(r, g, b, component);
	const basePrefix = `[${brandPrefix} > ${componentPrefix}]`;
	return new Logger(basePrefix);
}

export const logger = new Logger(`[${brandPrefix}]`);

export function print(...args: unknown[]): void {
	stdout.write(`${formatArgs(args)}\n`);
}

export function printError(...args: unknown[]): void {
	stderr.write(`${formatArgs(args)}\n`);
}
