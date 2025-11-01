import { readlinkSync } from "node:fs";
import { Glob } from "bun";
import { CMDLINE_NULL_SEPARATOR, LINUX_PROC_DIR } from "../../constants";
import type { ProcessInfo } from "../../types";

export async function getProcesses(): Promise<ProcessInfo[]> {
	const procDir = await Array.fromAsync(
		new Glob("*").scan({ cwd: LINUX_PROC_DIR, onlyFiles: false }),
	);

	const processes: ProcessInfo[] = [];

	for (const pid of procDir) {
		const pidNum = Number.parseInt(pid, 10);
		if (pidNum <= 0) continue;

		try {
			const cmdlineFile = Bun.file(`${LINUX_PROC_DIR}/${pid}/cmdline`);
			const cmdline = await cmdlineFile.text();

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
			} catch {
				// permission denied or symlink doesn't exist, use cmdline[0]
			}

			if (exePath) {
				processes.push([pidNum, exePath, parts.slice(1)]);
			}
		} catch {
			// skip inaccessible processes
		}
	}

	return processes;
}
