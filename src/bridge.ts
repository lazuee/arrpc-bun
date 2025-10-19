import { WebSocketServer } from "ws";
import { BRIDGE_PORT } from "./constants";
import type { ActivityPayload } from "./types/index.d.ts";
import { createLogger } from "./utils";

const log = createLogger("bridge", 87, 242, 135);

const lastMsg: Record<string, ActivityPayload> = {};

export const send = (msg: ActivityPayload): void => {
	if (process.env.ARRPC_DEBUG) {
		log("sending to bridge, connected clients:", wss.clients.size, "msg:", msg);
	}
	lastMsg[msg.socketId] = msg;
	for (const client of wss.clients) {
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

const wss = new WebSocketServer({ port });

wss.on("connection", (socket) => {
	log("web connected");

	for (const id in lastMsg) {
		const msg = lastMsg[id];
		if (msg && msg.activity != null) send(msg);
	}

	socket.on("close", () => {
		log("web disconnected");
	});
});

wss.on("listening", () => log("listening on", port));
