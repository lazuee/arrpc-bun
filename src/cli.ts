import { tmpdir } from "node:os";
import { join } from "node:path";
import { env, file } from "bun";
import {
	BRIDGE_PORT_RANGE,
	BRIDGE_PORT_RANGE_HYPERV,
	CLI_COLOR,
	DEFAULT_LOCALHOST,
	ENV_BRIDGE_HOST,
	ENV_BRIDGE_PORT,
	getDetectableDb,
	STATE_FILE_NAME,
} from "./constants";
import { isHyperVEnabled } from "./platform";
import type { ActivityPayload, DetectableApp, StateFileContent } from "./types";
import { createLogger, formatDuration, getPortRange } from "./utils";

const log = createLogger("cli", ...CLI_COLOR);

async function readStateFile(): Promise<StateFileContent | null> {
	const stateFilePath = join(tmpdir(), STATE_FILE_NAME);
	try {
		const stateFile = file(stateFilePath);
		if (!(await stateFile.exists())) {
			return null;
		}
		const content = await stateFile.json();
		return content as StateFileContent;
	} catch (error) {
		log(`failed to read state file: ${error}`);
		return null;
	}
}

async function getBridgePort(): Promise<{ host: string; port: number }> {
	const hostname = env[ENV_BRIDGE_HOST] || DEFAULT_LOCALHOST;

	if (env[ENV_BRIDGE_PORT]) {
		const envPort = Number.parseInt(env[ENV_BRIDGE_PORT], 10);
		if (!Number.isNaN(envPort)) {
			return { host: hostname, port: envPort };
		}
	}

	const useHyperVRange = isHyperVEnabled();
	const portRange = getPortRange(
		BRIDGE_PORT_RANGE,
		BRIDGE_PORT_RANGE_HYPERV,
		useHyperVRange,
	);

	for (let port = portRange[0]; port <= portRange[1]; port++) {
		try {
			const ws = new WebSocket(`ws://${hostname}:${port}`);
			await new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(() => {
					ws.close();
					reject(new Error("timeout"));
				}, 1000);

				ws.onopen = () => {
					clearTimeout(timeout);
					ws.close();
					resolve();
				};

				ws.onerror = () => {
					clearTimeout(timeout);
					reject(new Error("connection failed"));
				};
			});
			return { host: hostname, port };
		} catch {}
	}

	throw new Error(
		`Could not connect to arrpc bridge. Is arrpc running?\nTried ports ${portRange[0]}-${portRange[1]} on ${hostname}`,
	);
}

export async function listDatabase(): Promise<void> {
	console.log("Loading detectable games database...\n");

	const db = (await getDetectableDb()) as DetectableApp[];

	console.log(`Total games in database: ${db.length.toLocaleString()}\n`);

	const platforms = {
		win32: 0,
		linux: 0,
		darwin: 0,
		multiplatform: 0,
	};

	for (const app of db) {
		if (!app.executables || app.executables.length === 0) {
			continue;
		}

		const appPlatforms = new Set(
			app.executables
				.map((exe) => exe.os || "multiplatform")
				.filter(
					(os) => os === "win32" || os === "linux" || os === "darwin",
				),
		);

		if (appPlatforms.size === 0 || appPlatforms.size > 1) {
			platforms.multiplatform++;
		} else {
			const platform = Array.from(appPlatforms)[0] as
				| "win32"
				| "linux"
				| "darwin";
			platforms[platform]++;
		}
	}

	console.log("Games by platform:");
	console.log(`  Windows:        ${platforms.win32.toLocaleString()}`);
	console.log(`  Linux:          ${platforms.linux.toLocaleString()}`);
	console.log(`  macOS:          ${platforms.darwin.toLocaleString()}`);
	console.log(
		`  Multi-platform: ${platforms.multiplatform.toLocaleString()}`,
	);
	console.log("");

	console.log("Example games (first 10):");
	for (let i = 0; i < Math.min(10, db.length); i++) {
		const app = db[i];
		if (!app) continue;
		const exeCount = app.executables?.length || 0;
		const platforms = app.executables
			?.map((exe) => exe.os || "all")
			.filter((v, i, a) => a.indexOf(v) === i)
			.join(", ");
		console.log(
			`  ${i + 1}. ${app.name} (${exeCount} executables, platforms: ${platforms || "all"})`,
		);
	}

	console.log("\nTo see currently detected games, run with --list-detected");
}

export async function listDetected(): Promise<void> {
	const stateFile = await readStateFile();
	if (stateFile && stateFile.activities.length > 0) {
		console.log("Reading from arrpc state file...\n");
		displayDetectedGames(stateFile);
		return;
	}

	console.log("Connecting to arrpc bridge...\n");

	let bridgeInfo: { host: string; port: number };
	try {
		bridgeInfo = await getBridgePort();
	} catch (error) {
		const err = error as Error;
		console.error(`Error: ${err.message}`);
		console.error("\nNo state file found and bridge is not available.");
		console.error("Make sure arrpc is running.");
		process.exit(1);
	}

	log(`found bridge at ${bridgeInfo.host}:${bridgeInfo.port}, connecting...`);

	const ws = new WebSocket(`ws://${bridgeInfo.host}:${bridgeInfo.port}`);

	const detected = new Map<string, ActivityPayload>();

	await new Promise<void>((resolve) => {
		ws.onmessage = (event) => {
			try {
				const data = JSON.parse(
					event.data as string,
				) as ActivityPayload;
				if (data.activity) {
					detected.set(data.socketId, data);
				} else {
					detected.delete(data.socketId);
				}
			} catch (error) {
				log("failed to parse message:", error);
			}
		};

		ws.onopen = () => {
			log("connected, waiting for activity data...");

			setTimeout(() => {
				ws.close();
				resolve();
			}, 500);
		};

		ws.onerror = (error) => {
			console.error("WebSocket error:", error);
			process.exit(1);
		};

		ws.onclose = () => {
			resolve();
		};
	});

	displayDetectedGamesFromMap(detected);
}

function displayDetectedGames(stateFile: StateFileContent): void {
	console.log("\nCurrently detected games:\n");

	if (stateFile.activities.length === 0) {
		console.log("  No games currently detected.");
		console.log(
			"\n  Tip: Start a game and run this command again to see it detected.",
		);
		return;
	}

	for (let i = 0; i < stateFile.activities.length; i++) {
		const activity = stateFile.activities[i];
		if (!activity) continue;

		console.log(`  ${i + 1}. ${activity.name}`);
		console.log(`     App ID: ${activity.applicationId}`);
		console.log(`     PID: ${activity.pid}`);
		console.log(`     Socket: ${activity.socketId}`);
		if (activity.startTime) {
			console.log(`     Duration: ${formatDuration(activity.startTime)}`);
		}
		console.log("");
	}
}

function displayDetectedGamesFromMap(
	detected: Map<string, ActivityPayload>,
): void {
	console.log("\nCurrently detected games:\n");

	if (detected.size === 0) {
		console.log("  No games currently detected.");
		console.log(
			"\n  Tip: Start a game and run this command again to see it detected.",
		);
	} else {
		let index = 1;
		for (const [socketId, payload] of detected) {
			const { activity, pid } = payload;
			if (!activity) continue;

			const name = (activity as { name?: string }).name || "Unknown";
			const appId = (activity as { application_id?: string })
				.application_id;
			const startTime = (activity as { timestamps?: { start?: number } })
				.timestamps?.start;

			console.log(`  ${index}. ${name}`);
			console.log(`     App ID: ${appId}`);
			console.log(`     PID: ${pid}`);
			console.log(`     Socket: ${socketId}`);
			if (startTime) {
				console.log(`     Duration: ${formatDuration(startTime)}`);
			}
			console.log("");
			index++;
		}
	}
}
