import type { ServerWebSocket } from "bun";
import { BRIDGE_PORT_RANGE } from "./constants";
import type { ActivityPayload } from "./types";
import { createLogger } from "./utils";

const log = createLogger("bridge", 87, 242, 135);

const lastMsg: Record<string, ActivityPayload> = {};
const clients = new Set<ServerWebSocket<unknown>>();

export const send = (msg: ActivityPayload): void => {
	if (process.env.ARRPC_DEBUG) {
		log("sending to bridge, connected clients:", clients.size, "msg:", msg);
	}
	lastMsg[msg.socketId] = msg;
	for (const client of clients) {
		client.send(JSON.stringify(msg));
	}
};

export const init = (): void => {
	let startPort = BRIDGE_PORT_RANGE[0];
	if (process.env.ARRPC_BRIDGE_PORT) {
		const envPort = Number.parseInt(process.env.ARRPC_BRIDGE_PORT, 10);
		if (Number.isNaN(envPort)) {
			throw new Error("invalid ARRPC_BRIDGE_PORT");
		}
		startPort = envPort;
	}

	let port = startPort;
	let server: ReturnType<typeof Bun.serve> | undefined;

	while (port <= BRIDGE_PORT_RANGE[1]) {
		if (process.env.ARRPC_DEBUG) log("trying port", port);

		try {
			server = Bun.serve({
				port,
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

						for (const id in lastMsg) {
							const msg = lastMsg[id];
							if (msg && msg.activity != null) {
								ws.send(JSON.stringify(msg));
							}
						}
					},
					message() {
						// bridge doesn't handle incoming messages
					},
					close(ws) {
						log("web disconnected");
						clients.delete(ws);
					},
				},
			});

			log("listening on", port);
			break;
		} catch (e) {
			const error = e as { code?: string; message?: string };
			if (
				error.code === "EADDRINUSE" ||
				error.message?.includes("EADDRINUSE")
			) {
				log(port, "in use!");
				port++;
				continue;
			}
			throw e;
		}
	}

	if (!server) {
		throw new Error(
			`Failed to start bridge server - all ports in range ${BRIDGE_PORT_RANGE[0]}-${BRIDGE_PORT_RANGE[1]} are in use`,
		);
	}
};
