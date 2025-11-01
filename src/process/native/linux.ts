import { readlinkSync } from "node:fs";
import { file, Glob } from "bun";
import {
	ANTI_CHEAT_EXECUTABLES,
	CMDLINE_NULL_SEPARATOR,
	LINUX_PROC_DIR,
} from "../../constants";
import type { ProcessInfo } from "../../types";
import { resolveSteamApp } from "../steam";

export async function getProcesses(): Promise<ProcessInfo[]> {
	const procDir = await Array.fromAsync(
		new Glob("*").scan({ cwd: LINUX_PROC_DIR, onlyFiles: false }),
	);

	const processes: ProcessInfo[] = [];

	for (const pid of procDir) {
		const pidNum = Number.parseInt(pid, 10);
		if (pidNum <= 0) continue;

		try {
			const cmdline = await file(
				`${LINUX_PROC_DIR}/${pid}/cmdline`,
			).text();

			if (!cmdline) continue;

			const parts = cmdline.split(CMDLINE_NULL_SEPARATOR).filter(Boolean);
			if (parts.length === 0) continue;

			let exePath = parts[0] as string;

			try {
				const exeLink = readlinkSync(`${LINUX_PROC_DIR}/${pid}/exe`);
				if (exeLink && !exeLink.includes("(deleted)")) {
					const isWine =
						exeLink.includes("/wine") ||
						exeLink.includes("/wine64");
					if (!isWine) {
						exePath = exeLink;
					}
				}
			} catch {}

			if (exePath) {
				const exePathLower = exePath.toLowerCase();
				const cmdlineLower = cmdline.toLowerCase();

				const isAntiCheat = ANTI_CHEAT_EXECUTABLES.some(
					(ac) =>
						exePathLower.includes(ac) || cmdlineLower.includes(ac),
				);

				if (!isAntiCheat) {
					const steamPath = await resolveSteamApp(exePath);
					const finalPath = steamPath ?? exePath;

					processes.push([pidNum, finalPath, parts.slice(1)]);
				}
			}
		} catch {}
	}

	return processes;
}
