import type { IncomingMessage } from "node:http";
import { createServer, type Server as HTTPServer } from "node:http";
import { parse } from "node:querystring";
import { type WebSocket, WebSocketServer } from "ws";
import { WEBSOCKET_PORT_RANGE } from "../constants";
import type {
	ExtendedWebSocket,
	Handlers,
	RPCMessage,
} from "../types/index.d.ts";
import { createLogger } from "../utils";

const log = createLogger("websocket", 235, 69, 158);

export default class WSServer {
	private handlers!: Handlers;
	private http?: HTTPServer;
	private wss?: WebSocketServer;

	constructor(handlers: Handlers) {
		return (async () => {
			this.handlers = handlers;

			this.onConnection = this.onConnection.bind(this);
			this.onMessage = this.onMessage.bind(this);

			let port = WEBSOCKET_PORT_RANGE[0];

			let http: HTTPServer | undefined;
			let wss: WebSocketServer | undefined;

			while (port <= WEBSOCKET_PORT_RANGE[1]) {
				if (process.env.ARRPC_DEBUG) log("trying port", port);

				if (
					await new Promise<boolean>((res) => {
						http = createServer();
						http.on("error", (e: NodeJS.ErrnoException) => {
							if (e.code === "EADDRINUSE") {
								log(port, "in use!");
								res(false);
							}
						});

						wss = new WebSocketServer({ server: http });
						wss.on("error", (_e) => {});

						wss.on("connection", this.onConnection);

						http.listen(port, "127.0.0.1", () => {
							log("listening on", port);

							this.http = http;
							this.wss = wss;

							res(true);
						});
					})
				)
					break;
				port++;
			}

			return this;
		})() as unknown as WSServer;
	}

	onConnection(socket: WebSocket, req: IncomingMessage): void {
		const params = parse(req.url?.split("?")[1] ?? "");
		const ver = Number.parseInt((params.v as string) ?? "1", 10);
		const encoding = (params.encoding as string) ?? "json";
		const clientId = (params.client_id as string) ?? "";

		const origin = req.headers.origin ?? "";

		if (process.env.ARRPC_DEBUG)
			log(
				"new connection! origin:",
				origin,
				JSON.parse(JSON.stringify(params)),
			);

		if (
			origin !== "" &&
			![
				"https://discord.com",
				"https://ptb.discord.com",
				"https://canary.discord.com",
			].includes(origin)
		) {
			log("disallowed origin", origin);
			socket.close();
			return;
		}

		if (encoding !== "json") {
			log("unsupported encoding requested", encoding);
			socket.close();
			return;
		}

		if (ver !== 1) {
			log("unsupported version requested", ver);
			socket.close();
			return;
		}

		const extSocket = socket as ExtendedWebSocket;
		extSocket.clientId = clientId;
		extSocket.encoding = encoding;

		socket.on("error", (e) => {
			log("socket error", e);
		});

		socket.on("close", (e, r) => {
			log("socket closed", e, r);
			this.handlers.close(extSocket);
		});

		socket.on("message", this.onMessage.bind(this, extSocket));

		extSocket._send = extSocket.send as (data: string | Buffer) => void;
		extSocket.send = (msg: RPCMessage | string) => {
			if (process.env.ARRPC_DEBUG) log("sending", msg);
			const data = typeof msg === "string" ? msg : JSON.stringify(msg);
			extSocket._send?.(data);
		};

		this.handlers.connection(extSocket);
	}

	onMessage(socket: ExtendedWebSocket, msg: Buffer | string): void {
		const parsedMsg = JSON.parse(msg.toString()) as RPCMessage;
		if (process.env.ARRPC_DEBUG) log("message", parsedMsg);
		this.handlers.message(socket, parsedMsg);
	}
}
