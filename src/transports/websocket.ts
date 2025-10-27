import { type Server, type ServerWebSocket, serve } from "bun";
import {
	ALLOWED_DISCORD_ORIGINS,
	DEFAULT_LOCALHOST,
	ENV_DEBUG,
	ENV_WEBSOCKET_HOST,
	RPC_PROTOCOL_VERSION,
	WEBSOCKET_COLOR,
	WEBSOCKET_PORT_RANGE,
	WS_DEFAULT_ENCODING,
} from "../constants";
import type { ExtendedWebSocket, Handlers, RPCMessage } from "../types";
import { createLogger } from "../utils";

const log = createLogger("websocket", ...WEBSOCKET_COLOR);

export default class WSServer {
	private handlers!: Handlers;
	private server?: Server<unknown>;

	constructor(handlers: Handlers) {
		return (async () => {
			this.handlers = handlers;

			this.onConnection = this.onConnection.bind(this);
			this.onMessage = this.onMessage.bind(this);

			const hostname =
				process.env[ENV_WEBSOCKET_HOST] || DEFAULT_LOCALHOST;

			let port = WEBSOCKET_PORT_RANGE[0];
			let server: Server<unknown> | undefined;

			while (port <= WEBSOCKET_PORT_RANGE[1]) {
				if (process.env[ENV_DEBUG]) log("trying port", port);

				try {
					server = serve({
						port,
						hostname,
						fetch: (req, server) => {
							const url = new URL(req.url);
							const params = url.searchParams;
							const ver = Number.parseInt(
								params.get("v") ?? String(RPC_PROTOCOL_VERSION),
								10,
							);
							const encoding =
								params.get("encoding") ?? WS_DEFAULT_ENCODING;
							const clientId = params.get("client_id") ?? "";
							const origin = req.headers.get("origin") ?? "";

							if (
								origin !== "" &&
								!ALLOWED_DISCORD_ORIGINS.includes(origin)
							) {
								log("disallowed origin", origin);
								return new Response("Disallowed origin", {
									status: 403,
								});
							}

							if (encoding !== WS_DEFAULT_ENCODING) {
								log("unsupported encoding requested", encoding);
								return new Response("Unsupported encoding", {
									status: 400,
								});
							}

							if (ver !== RPC_PROTOCOL_VERSION) {
								log("unsupported version requested", ver);
								return new Response("Unsupported version", {
									status: 400,
								});
							}

							const upgraded = server.upgrade(req, {
								data: { clientId, encoding, origin },
							});

							if (!upgraded) {
								return new Response(
									"WebSocket upgrade failed",
									{
										status: 400,
									},
								);
							}

							return undefined;
						},
						websocket: {
							open: (
								ws: ServerWebSocket<{
									clientId: string;
									encoding: string;
									origin: string;
								}>,
							) => this.onConnection(ws),
							message: (
								ws: ServerWebSocket<{
									clientId: string;
									encoding: string;
									origin: string;
								}>,
								message: string | Buffer,
							) => this.onMessage(ws, message),
							close: (
								ws: ServerWebSocket<{
									clientId: string;
									encoding: string;
									origin: string;
								}>,
							) => {
								const extSocket =
									ws as unknown as ExtendedWebSocket;
								log("socket closed");
								this.handlers.close(extSocket);
							},
						},
					});

					log("listening on", port);
					this.server = server;
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

			if (!this.server) {
				throw new Error("Failed to find available port");
			}

			return this;
		})() as unknown as WSServer;
	}

	onConnection(
		ws: ServerWebSocket<{
			clientId: string;
			encoding: string;
			origin: string;
		}>,
	): void {
		const extSocket = ws as unknown as ExtendedWebSocket;
		const { clientId, encoding } = ws.data;

		if (process.env[ENV_DEBUG]) {
			log("new connection! clientId:", clientId, "encoding:", encoding);
		}

		extSocket.clientId = clientId;
		extSocket.encoding = encoding;

		const originalSend = ws.send.bind(ws);

		extSocket._send = (data: string | Buffer) => {
			originalSend(typeof data === "string" ? data : data.toString());
		};

		extSocket.send = (msg: RPCMessage | string) => {
			if (process.env[ENV_DEBUG]) log("sending", msg);
			const data = typeof msg === "string" ? msg : JSON.stringify(msg);
			extSocket._send?.(data);
		};

		this.handlers.connection(extSocket);
	}

	onMessage(
		ws: ServerWebSocket<{
			clientId: string;
			encoding: string;
			origin: string;
		}>,
		msg: Buffer | string,
	): void {
		const extSocket = ws as unknown as ExtendedWebSocket;
		const parsedMsg = JSON.parse(msg.toString()) as RPCMessage;
		if (process.env[ENV_DEBUG]) log("message", parsedMsg);
		this.handlers.message(extSocket, parsedMsg);
	}
}
