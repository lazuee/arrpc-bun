import { exec } from "node:child_process";
import type { ProcessInfo } from "@types";

export function getProcesses(): Promise<ProcessInfo[]> {
	return new Promise((resolve) => {
		exec(
			'powershell -Command "Get-Process | Select-Object Id,Path,ProcessName | ConvertTo-Csv -NoTypeInformation"',
			(_error, output) => {
				const lines = output.toString().split("\n");
				const processes = lines
					.slice(1)
					.map((line) => {
						const match = line.match(/"(\d+)","(.*)","(.*)"/);
						if (!match || !match[1]) return null;

						const pid = Number.parseInt(match[1], 10);
						let path = match[2]?.replace(/\\\\/g, "\\") || "";
						const processName = match[3] || "";

						if (!path && processName) {
							path = `${processName}.exe`;
						}

						if (!path) return null;
						return [pid, path, []] as ProcessInfo;
					})
					.filter((x): x is ProcessInfo => x !== null && x[1] !== "");

				resolve(processes);
			},
		);
	});
}
