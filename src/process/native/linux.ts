import { readdir, readFile } from "node:fs/promises";
import type { ProcessInfo } from "../../types/index.d.ts";

export const getProcesses = async (): Promise<ProcessInfo[]> => {
	const processes = await Promise.all(
		(await readdir("/proc")).map((pid) =>
			+pid > 0
				? readFile(`/proc/${pid}/cmdline`, "utf8").then(
						(path) =>
							[
								+pid,
								path.split("\0")[0],
								path.split("\0").slice(1),
							] as ProcessInfo,
						() => null,
					)
				: null,
		),
	);

	return processes.filter((x): x is ProcessInfo => x !== null);
};
