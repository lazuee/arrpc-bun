import { spawnSync } from "bun";

let hypervDetected: boolean | null = null;

export function isHyperVEnabled(): boolean {
	if (process.platform !== "win32") {
		return false;
	}

	if (hypervDetected !== null) {
		return hypervDetected;
	}

	try {
		const result = spawnSync(["sc", "query", "vmms"], {
			stdout: "pipe",
			windowsHide: true,
		});

		if (result.exitCode === 0 && result.stdout) {
			const output = result.stdout.toString().toLowerCase();
			if (output.includes("running")) {
				hypervDetected = true;
				return true;
			}
		}

		const wslResult = spawnSync(["wsl", "--status"], {
			stdout: "pipe",
			windowsHide: true,
		});

		if (wslResult.exitCode === 0) {
			hypervDetected = true;
			return true;
		}
	} catch {
		// assume no Hyper-V for safety
	}

	hypervDetected = false;
	return false;
}
