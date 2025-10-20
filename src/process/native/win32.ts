import { exec } from "node:child_process";
import type { ProcessInfo } from "../../types/index.d.ts";

export const getProcesses = (): Promise<ProcessInfo[]> =>
	new Promise((res) =>
		exec(
			'powershell -Command "Get-Process | Select-Object Id,Path | ConvertTo-Csv -NoTypeInformation"',
			(_e, out) => {
				const lines = out.toString().split("\n");
				const processes = lines
					.slice(1)
					.map((line) => {
						const match = line.match(/"(\d+)","(.*)"/);
						if (!match || !match[1] || !match[2]) return null;
						const pid = Number.parseInt(match[1], 10);
						const path = match[2].replace(/\\\\/g, "\\");
						return [pid, path, []] as ProcessInfo;
					})
					.filter((x): x is ProcessInfo => x !== null && x[1] !== "");
				res(processes);
			},
		),
	);
