import { exec } from "node:child_process";
import type { ProcessInfo } from "../../types/index.d.ts";

export const getProcesses = (): Promise<ProcessInfo[]> =>
	new Promise((res) =>
		exec("wmic process get ProcessID,ExecutablePath /format:csv", (_e, out) => {
			res(
				out
					.toString()
					.split("\r\n")
					.slice(2)
					.map((x) => {
						const parsed = x.trim().split(",").slice(1).reverse();
						const pidNum = Number.parseInt(parsed[0] || "0", 10);
						return [
							Number.isNaN(pidNum) ? 0 : pidNum,
							parsed[1] || "",
							[],
						] as ProcessInfo;
					})
					.filter((x) => x[1]),
			);
		}),
	);
