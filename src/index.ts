import { env } from "bun";
import { init as initBridge, send as sendToBridge } from "./bridge";
import { DEFAULT_VERSION, ENV_DEBUG, ENV_IPC_MODE } from "./constants";
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

const shutdown = () => {
	log("received shutdown signal");
	server.shutdown();
	process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
