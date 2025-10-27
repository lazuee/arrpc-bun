import { spawnSync } from "node:child_process";

let hypervDetected: boolean | null = null;

export function isHyperVEnabled(): boolean {
	if (process.platform !== "win32") {
		return false;
	}

	if (hypervDetected !== null) {
		return hypervDetected;
	}

	try {
		const result = spawnSync("sc", ["query", "vmms"], {
			encoding: "utf8",
			timeout: 2000,
			windowsHide: true,
		});

		if (result.status === 0 && result.stdout) {
			const output = result.stdout.toLowerCase();
			if (output.includes("running")) {
				hypervDetected = true;
				return true;
			}
		}

		const wslResult = spawnSync("wsl", ["--status"], {
			encoding: "utf8",
			timeout: 2000,
			windowsHide: true,
		});

		if (wslResult.status === 0) {
			hypervDetected = true;
			return true;
		}
	} catch {
		// assume no Hyper-V for safety
	}

	hypervDetected = false;
	return false;
}
