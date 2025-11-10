import { env } from "bun";
import { init as initBridge, send as sendToBridge } from "./bridge";
import { listDatabase, listDetected } from "./cli";
import {
	CLI_ARG_LIST_DATABASE,
	CLI_ARG_LIST_DETECTED,
	DEFAULT_VERSION,
	ENV_DEBUG,
	ENV_IGNORE_LIST_FILE,
	ENV_IPC_MODE,
	ENV_NO_STATE_FILE,
	ENV_PARENT_MONITOR,
} from "./constants";
import { ignoreList } from "./ignore-list";
import Server from "./server";
import { stateManager } from "./state";
import { log } from "./utils";

let version = DEFAULT_VERSION;
try {
	const pkg = await import("../package.json", { with: { type: "json" } });
	version = pkg.default.version;
} catch {
	version = DEFAULT_VERSION;
}

if (process.argv.includes(CLI_ARG_LIST_DATABASE)) {
	await listDatabase();
	process.exit(0);
}

if (process.argv.includes(CLI_ARG_LIST_DETECTED)) {
	await listDetected();
	process.exit(0);
}

log(`arRPC-Bun v${version}`);

const ignoreListFile = env[ENV_IGNORE_LIST_FILE];
if (ignoreListFile) {
	await ignoreList.initialize(ignoreListFile);
	log(`ignore list enabled with file: ${ignoreListFile}`);
} else {
	await ignoreList.initialize();
}

await initBridge();

const server = await Server.create();

server.on("activity", (data) => {
	if (env[ENV_DEBUG]) {
		log("activity event received, forwarding to bridge:", data);
	}
	sendToBridge(data);
	if (!env[ENV_NO_STATE_FILE]) {
		stateManager.update(data);
	}
});

if (env[ENV_IPC_MODE]) {
	process.stderr.write(
		`${JSON.stringify({
			type: "READY",
			data: {
				version,
			},
		})}\n`,
	);
}

if (env[ENV_PARENT_MONITOR]) {
	const initialParentPid = process.ppid;
	let shutdownTriggered = false;

	const handleParentDeath = () => {
		if (shutdownTriggered) return;
		shutdownTriggered = true;
		log("parent process died, shutting down");
		shutdown();
	};

	process.stdout.on("error", (err) => {
		if ((err as NodeJS.ErrnoException).code === "EPIPE") {
			handleParentDeath();
		}
	});

	process.stderr.on("error", (err) => {
		if ((err as NodeJS.ErrnoException).code === "EPIPE") {
			handleParentDeath();
		}
	});

	if (process.stdin.isTTY === false) {
		let buffer = "";

		process.stdin.on("data", async (chunk) => {
			buffer += chunk.toString();
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";

			for (const line of lines) {
				if (!line.trim()) continue;

				try {
					const message = JSON.parse(line);
					await handleParentMessage(message);
				} catch (err) {
					if (env[ENV_DEBUG]) {
						log(`failed to parse stdin message: ${err}`);
					}
				}
			}
		});

		process.stdin.on("end", () => {
			if (env[ENV_DEBUG]) {
				log("stdin closed");
			}
			handleParentDeath();
		});

		process.stdin.resume();
	}

	const parentMonitor = setInterval(() => {
		if (shutdownTriggered) {
			clearInterval(parentMonitor);
			return;
		}

		const currentParentPid = process.ppid;
		if (currentParentPid !== initialParentPid) {
			log(
				`parent process changed from ${initialParentPid} to ${currentParentPid}, shutting down`,
			);
			clearInterval(parentMonitor);
			handleParentDeath();
			return;
		}

		try {
			process.kill(initialParentPid, 0);
		} catch {
			log(
				`parent process ${initialParentPid} no longer exists, shutting down`,
			);
			clearInterval(parentMonitor);
			handleParentDeath();
			return;
		}

		if (env[ENV_IPC_MODE]) {
			try {
				const heartbeat = `${JSON.stringify({
					type: "HEARTBEAT",
					data: { timestamp: Date.now() },
				})}\n`;
				const written = process.stderr.write(heartbeat);
				if (!written) {
					log("heartbeat write failed, parent likely dead");
					clearInterval(parentMonitor);
					handleParentDeath();
				}
			} catch (err) {
				log(`heartbeat error: ${err}, parent likely dead`);
				clearInterval(parentMonitor);
				handleParentDeath();
			}
		}
	}, 2000);
}

async function handleParentMessage(message: {
	type: string;
	data?: { games?: string[] };
}) {
	if (env[ENV_DEBUG]) {
		log(`received parent message: ${JSON.stringify(message)}`);
	}

	try {
		switch (message.type) {
			case "IGNORE_GAMES": {
				const games = message.data?.games;
				if (Array.isArray(games)) {
					await ignoreList.add(games);
					if (env[ENV_IPC_MODE]) {
						process.stderr.write(
							`${JSON.stringify({
								type: "IGNORE_GAMES_ACK",
								data: { success: true, count: games.length },
							})}\n`,
						);
					}
				}
				break;
			}

			case "UNIGNORE_GAMES": {
				const games = message.data?.games;
				if (Array.isArray(games)) {
					await ignoreList.remove(games);
					if (env[ENV_IPC_MODE]) {
						process.stderr.write(
							`${JSON.stringify({
								type: "UNIGNORE_GAMES_ACK",
								data: { success: true, count: games.length },
							})}\n`,
						);
					}
				}
				break;
			}

			case "CLEAR_IGNORED_GAMES": {
				await ignoreList.clear();
				if (env[ENV_IPC_MODE]) {
					process.stderr.write(
						`${JSON.stringify({
							type: "CLEAR_IGNORED_GAMES_ACK",
							data: { success: true },
						})}\n`,
					);
				}
				break;
			}

			case "GET_IGNORED_GAMES": {
				const games = ignoreList.getAll();
				if (env[ENV_IPC_MODE]) {
					process.stderr.write(
						`${JSON.stringify({
							type: "IGNORED_GAMES",
							data: { games },
						})}\n`,
					);
				}
				break;
			}

			case "RELOAD_IGNORE_LIST": {
				const result = await ignoreList.reload();
				if (env[ENV_IPC_MODE]) {
					process.stderr.write(
						`${JSON.stringify({
							type: "IGNORE_LIST_RELOADED",
							data: result,
						})}\n`,
					);
				}
				break;
			}

			default:
				if (env[ENV_DEBUG]) {
					log(`unknown parent message type: ${message.type}`);
				}
		}
	} catch (err) {
		if (env[ENV_IPC_MODE]) {
			process.stderr.write(
				`${JSON.stringify({
					type: "ERROR",
					data: {
						message:
							err instanceof Error
								? err.message
								: "Unknown error",
					},
				})}\n`,
			);
		}
	}
}

const shutdown = async () => {
	log("received shutdown signal");
	if (!env[ENV_NO_STATE_FILE]) {
		await stateManager.cleanup();
	}
	server.shutdown();
	process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
