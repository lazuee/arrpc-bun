import { env, type Server, type ServerWebSocket, serve } from "bun";
import {
	ALLOWED_DISCORD_ORIGINS,
	DEFAULT_LOCALHOST,
	ENV_DEBUG,
	ENV_IPC_MODE,
	ENV_WEBSOCKET_HOST,
	RPC_PROTOCOL_VERSION,
	WEBSOCKET_COLOR,
	WEBSOCKET_PORT_RANGE,
	WEBSOCKET_PORT_RANGE_HYPERV,
	WS_DEFAULT_ENCODING,
} from "../constants";
import { ignoreList } from "../ignore-list";
import { isHyperVEnabled } from "../platform";
import type { ExtendedWebSocket, Handlers, RPCMessage } from "../types";
import { createLogger, getPortRange } from "../utils";

const log = createLogger("websocket", ...WEBSOCKET_COLOR);

type WSData = {
	clientId: string;
	encoding: string;
	origin: string;
};

export default class WSServer {
	private handlers!: Handlers;
	private server?: Server<unknown>;

	constructor(handlers: Handlers) {
		this.handlers = handlers;

		this.onConnection = this.onConnection.bind(this);
		this.onMessage = this.onMessage.bind(this);

		const useHyperVRange = isHyperVEnabled();
		const portRange = getPortRange(
			WEBSOCKET_PORT_RANGE,
			WEBSOCKET_PORT_RANGE_HYPERV,
			useHyperVRange,
		);

		if (useHyperVRange) {
			log("Hyper-V detected, using extended port range");
		}

		const hostname = env[ENV_WEBSOCKET_HOST] || DEFAULT_LOCALHOST;

		let port = portRange[0];
		let server: Server<unknown> | undefined;

		while (port <= portRange[1]) {
			if (env[ENV_DEBUG]) log("trying port", port);

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

						if (
							clientId &&
							ignoreList.shouldIgnoreClientId(clientId)
						) {
							log("client id is ignored:", clientId);
							return new Response("Client ID is ignored", {
								status: 403,
							});
						}

						const upgraded = server.upgrade(req, {
							data: { clientId, encoding, origin },
						});

						if (!upgraded) {
							return new Response("WebSocket upgrade failed", {
								status: 400,
							});
						}

						return undefined;
					},
					websocket: {
						open: (ws: ServerWebSocket<WSData>) =>
							this.onConnection(ws),
						message: (
							ws: ServerWebSocket<WSData>,
							message: string | Buffer,
						) => this.onMessage(ws, message),
						close: (ws: ServerWebSocket<WSData>) => {
							const extSocket =
								ws as unknown as ExtendedWebSocket;
							log("socket closed");
							this.handlers.close(extSocket);
						},
					},
				});

				log("listening on", port);
				this.server = server;

				if (env[ENV_IPC_MODE]) {
					process.stderr.write(
						`${JSON.stringify({
							type: "SERVER_INFO",
							data: {
								port: server.port,
								host: hostname,
								service: "websocket",
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

		if (!this.server) {
			throw new Error(
				`Failed to start WebSocket server - all ports in range ${portRange[0]}-${portRange[1]} are in use`,
			);
		}
	}

	getPort(): number | undefined {
		return this.server?.port;
	}

	onConnection(ws: ServerWebSocket<WSData>): void {
		const extSocket = ws as unknown as ExtendedWebSocket;
		const { clientId, encoding } = ws.data;

		if (env[ENV_DEBUG]) {
			log("new connection! clientId:", clientId, "encoding:", encoding);
		}

		extSocket.clientId = clientId;
		extSocket.encoding = encoding;

		const originalSend = ws.send.bind(ws);

		extSocket._send = (data: string | Buffer) => {
			originalSend(typeof data === "string" ? data : data.toString());
		};

		extSocket.send = (msg: RPCMessage | string) => {
			if (env[ENV_DEBUG]) log("sending", msg);
			const data = typeof msg === "string" ? msg : JSON.stringify(msg);
			extSocket._send?.(data);
		};

		this.handlers.connection(extSocket);
	}

	onMessage(ws: ServerWebSocket<WSData>, msg: Buffer | string): void {
		const extSocket = ws as unknown as ExtendedWebSocket;
		const parsedMsg = JSON.parse(msg.toString()) as RPCMessage;
		if (env[ENV_DEBUG]) log("message", parsedMsg);
		this.handlers.message(extSocket, parsedMsg);
	}
}
