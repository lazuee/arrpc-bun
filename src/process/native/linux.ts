import { readlinkSync } from "node:fs";
import { join, sep } from "node:path";
import { file, Glob } from "bun";
import {
	ANTI_CHEAT_EXECUTABLES,
	CMDLINE_NULL_SEPARATOR,
	LINUX_PROC_DIR,
} from "../../constants";
import type { ProcessInfo } from "../../types";
import { resolveSteamApp } from "../steam";

const ANTI_CHEAT_EXECUTABLES_LOWER = ANTI_CHEAT_EXECUTABLES.map((ac) =>
	ac.toLowerCase(),
);

const STEAM_PATH_INDICATORS = [
	`${sep}.steam${sep}`,
	`${sep}.local${sep}share${sep}steam${sep}`,
	`${sep}steamapps${sep}`,
] as const;

function isSteamPath(pathLower: string): boolean {
	return STEAM_PATH_INDICATORS.some((indicator) =>
		pathLower.includes(indicator),
	);
}

export async function getProcesses(): Promise<ProcessInfo[]> {
	const processes: ProcessInfo[] = [];
	const glob = new Glob("*");
	const scanner = glob.scan({ cwd: LINUX_PROC_DIR, onlyFiles: false });

	const BATCH_SIZE = 50;
	const batch: Promise<ProcessInfo | null>[] = [];

	for await (const pid of scanner) {
		const pidNum = Number.parseInt(pid, 10);
		if (pidNum <= 0) continue;

		batch.push(
			(async (): Promise<ProcessInfo | null> => {
				try {
					const [cmdline, exeLink, stat] = await Promise.all([
						file(join(LINUX_PROC_DIR, pid, "cmdline")).text(),
						(async () => {
							try {
								return readlinkSync(
									join(LINUX_PROC_DIR, pid, "exe"),
								);
							} catch {
								return null;
							}
						})(),
						(async () => {
							try {
								return await file(
									join(LINUX_PROC_DIR, pid, "stat"),
								).text();
							} catch {
								return null;
							}
						})(),
					]);

					if (!cmdline) return null;

					if (stat) {
						const statMatch = stat.match(/\)\s+([A-Za-z])/);
						if (statMatch) {
							const state = statMatch[1];
							if (state === "T" || state === "t") {
								return null;
							}
						}
					}

					const parts = cmdline
						.split(CMDLINE_NULL_SEPARATOR)
						.filter(Boolean);
					if (parts.length === 0) return null;

					let exePath = parts[0] as string;

					if (exeLink && !exeLink.includes("(deleted)")) {
						const isWine =
							exeLink.includes(`${sep}wine`) ||
							exeLink.includes(`${sep}wine64`);
						if (!isWine) {
							exePath = exeLink;
						}
					}

					if (!exePath) return null;

					const exePathLower = exePath.toLowerCase();
					const cmdlineLower = cmdline.toLowerCase();

					const isAntiCheat = ANTI_CHEAT_EXECUTABLES_LOWER.some(
						(ac) =>
							exePathLower.includes(ac) ||
							cmdlineLower.includes(ac),
					);

					if (isAntiCheat) return null;

					const steamPath = isSteamPath(exePathLower)
						? await resolveSteamApp(exePath)
						: null;
					const finalPath = steamPath ?? exePath;

					return [pidNum, finalPath, parts.slice(1)];
				} catch {
					return null;
				}
			})(),
		);

		if (batch.length >= BATCH_SIZE) {
			const results = await Promise.all(batch);
			for (const result of results) {
				if (result) processes.push(result);
			}
			batch.length = 0;
		}
	}

	if (batch.length > 0) {
		const results = await Promise.all(batch);
		for (const result of results) {
			if (result) processes.push(result);
		}
	}

	return processes;
}
