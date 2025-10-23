import { file, Glob } from "bun";
import type { ProcessInfo } from "../../types";

export async function getProcesses(): Promise<ProcessInfo[]> {
	const procDir = await Array.fromAsync(
		new Glob("*").scan({ cwd: "/proc", onlyFiles: false }),
	);

	const processes = await Promise.all(
		procDir.map(async (pid) => {
			const pidNum = Number.parseInt(pid, 10);
			if (pidNum <= 0) return null;

			try {
				const cmdline = await file(`/proc/${pid}/cmdline`).text();
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
