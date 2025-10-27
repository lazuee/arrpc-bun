#!/usr/bin/env bun

import * as Bridge from "./bridge";
import { DEFAULT_VERSION, ENV_DEBUG } from "./constants";
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

(async () => {
	await Bridge.init();

	const server = await new Server();

	server.on("activity", (data) => {
		if (process.env[ENV_DEBUG]) {
			log("activity event received, forwarding to bridge:", data);
		}
		Bridge.send(data);
	});

	const shutdown = async () => {
		log("received shutdown signal");
		await server.shutdown();
		process.exit(0);
	};

	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
})();
