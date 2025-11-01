import { env } from "bun";
import { init as initBridge, send as sendToBridge } from "./bridge";
import {
	DEFAULT_VERSION,
	ENV_DEBUG,
	ENV_IPC_MODE,
	ENV_PARENT_MONITOR,
} from "./constants";
import Server from "./server";
import { log } from "./utils";

let version = DEFAULT_VERSION;
try {
	const pkg = await import("../package.json", { with: { type: "json" } });
	version = pkg.default.version;
} catch {
	version = DEFAULT_VERSION;
}

log(`arRPC-Bun v${version}`);

await initBridge();

const server = await Server.create();

server.on("activity", (data) => {
	if (env[ENV_DEBUG]) {
		log("activity event received, forwarding to bridge:", data);
	}
	sendToBridge(data);
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

const shutdown = () => {
	log("received shutdown signal");
	server.shutdown();
	process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
