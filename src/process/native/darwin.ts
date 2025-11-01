import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { Glob, spawn } from "bun";
import type { ProcessInfo } from "../../types";

const winExePathRegex =
	/((?:(?:[a-zA-Z]:|\\\\[\w\s.]+\\[\w\s.$]+)\\(?:[\w\s.]+\\)*)(?:[\w\s.]*?)\.exe)/;
const parallelsDir = resolve(homedir(), "Applications (Parallels)");
const steamDir = resolve(
	homedir(),
	"Library/Application Support/Steam/steamapps",
);

const steamApps: {
	appid: string;
	name: string;
	installdir: string;
}[] = [];

async function initSteamApps() {
	for await (const file of new Glob("appmanifest_*.acf").scan({
		cwd: steamDir,
	})) {
		const text = await Bun.file(join(steamDir, file)).text();
		const appid = text.match(/"appid"\s+"(\d+)"/)?.[1];
		const name = text.match(/"name"\s+"([^"]+)"/)?.[1];
		const installdir = text.match(/"installdir"\s+"([^"]+)"/)?.[1];

		if (appid && name && installdir) {
			steamApps.push({
				appid,
				name,
				installdir,
			});
		}
	}
}

await initSteamApps();

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

		let appPath = cmdline.substring(0, appIndex + 4);
		const restOfLine = cmdline.substring(pathEnd).trim();
		const args = restOfLine ? restOfLine.split(/\s+/) : [];

		if (appPath.startsWith(parallelsDir)) {
			if (appPath.endsWith(".exe.app")) {
				appPath = appPath.replace(".app", "");
			} else {
				appPath += "_name";
			}
		}

		if (appPath.startsWith(steamDir)) {
			const steamApp = steamApps.find((app) =>
				appPath.startsWith(join(steamDir, "common", app.installdir)),
			);
			if (steamApp) {
				appPath = join(
					steamDir,
					"common",
					steamApp.installdir,
					`${steamApp.name}.app_name`,
				);
			}
		}

		return { exe: appPath, args };
	}

	if (winExePathRegex.test(cmdline)) {
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
		const proc = spawn(["ps", "-awwxo", "pid=,args="]);
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
