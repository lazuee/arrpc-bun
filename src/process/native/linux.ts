import { file, Glob } from "bun";
import type { ProcessInfo } from "../../types";

import { CMDLINE_NULL_SEPARATOR, LINUX_PROC_DIR } from "../../constants";

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
				const parts = cmdline.split(CMDLINE_NULL_SEPARATOR);
				const path = parts[0];
				if (!path) return null;
				return [pidNum, path, parts.slice(1)] as ProcessInfo;
			} catch {
				return null;
			}
		}),
	);

	return processes.filter((x): x is ProcessInfo => x !== null);
}
