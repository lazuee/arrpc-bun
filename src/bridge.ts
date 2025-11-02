import { env, type Server, type ServerWebSocket, serve } from "bun";
import {
	BRIDGE_COLOR,
	BRIDGE_PORT_RANGE,
	BRIDGE_PORT_RANGE_HYPERV,
	DEFAULT_LOCALHOST,
	ENV_BRIDGE_HOST,
	ENV_BRIDGE_PORT,
	ENV_DEBUG,
	ENV_IPC_MODE,
	ENV_NO_BRIDGE,
} from "./constants";
import { isHyperVEnabled } from "./platform";
import type { ActivityPayload } from "./types";
import { createLogger } from "./utils";

const log = createLogger("bridge", ...BRIDGE_COLOR);

const lastMsg = new Map<string, ActivityPayload>();
const clients = new Set<ServerWebSocket<unknown>>();
let bridgeServer: Server<unknown> | undefined;

export function getPort(): number | undefined {
	return bridgeServer?.port;
}

export function send(msg: ActivityPayload): void {
	if (env[ENV_DEBUG]) {
		log("sending to bridge, connected clients:", clients.size, "msg:", msg);
	}
	lastMsg.set(msg.socketId, msg);
	const msgStr = JSON.stringify(msg);
	for (const client of clients) {
		client.send(msgStr);
	}
}

export async function init(): Promise<void> {
	if (env[ENV_NO_BRIDGE]) {
		log("bridge disabled via ENV_NO_BRIDGE");
		return;
	}

	const useHyperVRange = isHyperVEnabled();
	const portRange = useHyperVRange
		? BRIDGE_PORT_RANGE_HYPERV
		: BRIDGE_PORT_RANGE;

	if (useHyperVRange) {
		log("Hyper-V detected, using extended port range");
	}

	let startPort = portRange[0];
	if (env[ENV_BRIDGE_PORT]) {
		const envPort = Number.parseInt(env[ENV_BRIDGE_PORT], 10);
		if (Number.isNaN(envPort)) {
			throw new Error("invalid ARRPC_BRIDGE_PORT");
		}
		startPort = envPort;
	}

	const hostname = env[ENV_BRIDGE_HOST] || DEFAULT_LOCALHOST;

	let port = startPort;
	let server: Server<unknown> | undefined;

	while (port <= portRange[1]) {
		if (env[ENV_DEBUG]) log("trying port", port);

		try {
			server = serve({
				port,
				hostname,
				fetch(req, srv) {
					const upgraded = srv.upgrade(req, { data: {} });
					if (!upgraded) {
						return new Response("WebSocket upgrade failed", {
							status: 400,
						});
					}
					return undefined;
				},
				websocket: {
					open(ws) {
						log("web connected");
						clients.add(ws);

						for (const msg of lastMsg.values()) {
							if (msg && msg.activity != null) {
								ws.send(JSON.stringify(msg));
							}
						}
					},
					message() {},
					close(ws) {
						log("web disconnected");
						clients.delete(ws);
					},
				},
			});

			bridgeServer = server;
			log("listening on", port);

			if (env[ENV_IPC_MODE]) {
				process.stderr.write(
					`${JSON.stringify({
						type: "SERVER_INFO",
						data: {
							port: server.port,
							host: hostname,
							service: "bridge",
						},
					})}\n`,
				);
			}

			break;
		} catch (e) {
			const error = e as { code?: string; message?: string };
			if (error.code === "EADDRINUSE") {
				log(port, "in use!");
				port++;
				continue;
			}
			throw e;
		}
	}

	if (!server) {
		throw new Error(
			`Failed to start bridge server - all ports in range ${portRange[0]}-${portRange[1]} are in use`,
		);
	}
}
