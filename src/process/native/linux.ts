import { readdir, readFile } from "node:fs/promises";
import type { ProcessInfo } from "@types";

export async function getProcesses(): Promise<ProcessInfo[]> {
	const pids = await readdir("/proc");

	const processes = await Promise.all(
		pids.map(async (pid) => {
			const pidNum = Number.parseInt(pid, 10);
			if (pidNum <= 0) return null;

			try {
				const cmdline = await readFile(`/proc/${pid}/cmdline`, "utf8");
				const parts = cmdline.split("\0");
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
