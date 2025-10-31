import type { ProcessInfo } from "../../types";

const winExePathRegex =
	/((?:(?:[a-zA-Z]:|\\\\[\w\s.]+\\[\w\s.$]+)\\(?:[\w\s.]+\\)*)(?:[\w\s.]*?)\.exe)/;

function parseCommandLine(cmdline: string): { exe: string; args: string[] } {
	const appIndex = cmdline.toLowerCase().indexOf(".app");
	if (appIndex !== -1) {
		let pathEnd = appIndex + 4;

		if (cmdline.substring(pathEnd).startsWith("/Contents/MacOS/")) {
			const contentsMacosStart = pathEnd + "/Contents/MacOS/".length;
			let foundArgStart = false;

			for (let i = contentsMacosStart; i < cmdline.length; i++) {
				if (cmdline[i] === " ") {
					const nextNonSpace = cmdline.substring(i).trim();
					if (
						nextNonSpace.startsWith("-") ||
						nextNonSpace.startsWith("+") ||
						nextNonSpace === ""
					) {
						pathEnd = i;
						foundArgStart = true;
						break;
					}
				}
			}

			if (!foundArgStart) {
				pathEnd = cmdline.length;
			}
		}

		// extract just the .app bundle path (not the full Contents/MacOS/... path)
		let appPath = cmdline.substring(0, appIndex + 4); // Just up to .app
		const restOfLine = cmdline.substring(pathEnd).trim();
		const args = restOfLine ? restOfLine.split(/\s+/) : [];

		// support Parallels Desktop - Coherence mode
		if (appPath.includes("Applications (Parallels)")) {
			if (appPath.endsWith(".exe.app")) {
				appPath = appPath.replace(".app", ""); // executable name
			} else {
				appPath += "_parallels"; // game name
			}
		}

		return { exe: appPath, args };
	}

	// support wine
	if (winExePathRegex.test(cmdline)) {
		// extract windows executable path
		const exePath = cmdline.match(winExePathRegex)?.[0];
		if (exePath) {
			const exePathIdx = cmdline.indexOf(exePath);
			const restOfLine = cmdline
				.substring(exePathIdx + exePath.length)
				.trim();
			const args = restOfLine ? restOfLine.split(/\s+/) : [];
			return { exe: exePath, args };
		}
	}

	//simple whitespace split for non-.app executables
	const parts = cmdline.split(/\s+/).filter(Boolean);
	if (parts.length === 0) {
		return { exe: "", args: [] };
	}

	const exe = parts[0] as string;
	const args = parts.slice(1);

	return { exe, args };
}

export async function getProcesses(): Promise<ProcessInfo[]> {
	try {
		const proc = Bun.spawn(["ps", "-awwxo", "pid=,args="]);
		const output = await new Response(proc.stdout).text();
		const lines = output.split("\n");

		const processes: ProcessInfo[] = [];

		for (const line of lines) {
			const trimmedLine = line.trim();
			if (!trimmedLine) continue;

			const firstSpaceIndex = trimmedLine.indexOf(" ");
			if (firstSpaceIndex === -1) continue;

			const pidNum = Number.parseInt(
				trimmedLine.substring(0, firstSpaceIndex),
				10,
			);
			const cmdline = trimmedLine.substring(firstSpaceIndex).trim();

			if (Number.isNaN(pidNum) || pidNum <= 0) continue;

			// filter out kernel processes and empty commands
			if (
				!cmdline ||
				cmdline.startsWith("[") ||
				cmdline.startsWith("<")
			) {
				continue;
			}

			const { exe, args } = parseCommandLine(cmdline);

			if (!exe) continue;

			processes.push([pidNum, exe, args]);
		}

		return processes;
	} catch {
		return [];
	}
}
