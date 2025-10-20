#!/usr/bin/env bun

import * as Bridge from "./bridge";
import Server from "./server";
import { log } from "./utils";

log("arRPC-Bun v1.1.3");

Bridge.init();

(async () => {
	// biome-ignore lint/suspicious/noTsIgnore: ts(80007) await is needed for async constructor
	// @ts-ignore - Server constructor returns Promise via async IIFE pattern
	const server = await new Server();

	server.on("activity", (data) => {
		if (process.env.ARRPC_DEBUG) {
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
