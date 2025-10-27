import { readlink } from "node:fs/promises";
import { file, Glob } from "bun";
import { CMDLINE_NULL_SEPARATOR, LINUX_PROC_DIR } from "../../constants";
import type { ProcessInfo } from "../../types";

export async function getProcesses(): Promise<ProcessInfo[]> {
	const procDir = await Array.fromAsync(
		new Glob("*").scan({ cwd: LINUX_PROC_DIR, onlyFiles: false }),
	);

	const processes = await Promise.all(
		procDir.map(async (pid) => {
			const pidNum = Number.parseInt(pid, 10);
			if (pidNum <= 0) return null;

			try {
				const cmdline = await file(
					`${LINUX_PROC_DIR}/${pid}/cmdline`,
				).text();

				if (!cmdline) return null;

				const parts = cmdline
					.split(CMDLINE_NULL_SEPARATOR)
					.filter(Boolean);
				if (parts.length === 0) return null;

				let exePath = parts[0];

				try {
					const exeLink = await readlink(
						`${LINUX_PROC_DIR}/${pid}/exe`,
					);
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

				if (!exePath) return null;
				return [pidNum, exePath, parts.slice(1)] as ProcessInfo;
			} catch {
				return null;
			}
		}),
	);

	return processes.filter((x): x is ProcessInfo => x !== null);
}
