import { env } from "bun";
import { init as initBridge, send as sendToBridge } from "./bridge";
import Server from "./server";
import { log } from "./utils";

import { DEFAULT_VERSION, ENV_DEBUG } from "./constants";

let version = DEFAULT_VERSION;
try {
	const pkg = await import("../package.json", { with: { type: "json" } });
	version = pkg.default.version;
} catch {
	version = DEFAULT_VERSION;
}

log(`arRPC-Bun v${version}`);

(async () => {
	await initBridge();

	const server = await Server.create();

	server.on("activity", (data) => {
		if (env[ENV_DEBUG]) {
			log("activity event received, forwarding to bridge:", data);
		}
		sendToBridge(data);
	});

	const shutdown = () => {
		log("received shutdown signal");
		server.shutdown();
		process.exit(0);
	};

	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
})();
