import type { ServerWebSocket } from "bun";
import { BRIDGE_PORT } from "./constants";
import type { ActivityPayload } from "./types/index.d.ts";
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

let port = BRIDGE_PORT;
if (process.env.ARRPC_BRIDGE_PORT) {
	port = Number.parseInt(process.env.ARRPC_BRIDGE_PORT, 10);
	if (Number.isNaN(port)) {
		throw new Error("invalid port");
	}
}

const _server = Bun.serve({
	port,
	fetch(req, server) {
		const upgraded = server.upgrade(req);
		if (!upgraded) {
			return new Response("WebSocket upgrade failed", { status: 400 });
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
		message(_ws, _message) {
			// bridge doesn't handle incoming messages
		},
		close(ws) {
			log("web disconnected");
			clients.delete(ws);
		},
	},
});

log("listening on", port);
