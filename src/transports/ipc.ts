import { unlinkSync } from "node:fs";
import {
	createConnection,
	createServer,
	type Server,
	type Socket,
} from "node:net";
import { resolve } from "node:path";
import { env, platform } from "node:process";
import {
	IPC_MAX_RETRIES,
	IPCCloseCode,
	IPCErrorCode,
	IPCMessageType,
	SOCKET_AVAILABILITY_TIMEOUT,
} from "../constants";
import type { ExtendedSocket, Handlers, RPCMessage } from "../types";
import { createLogger } from "../utils";

const log = createLogger("ipc", 254, 231, 92);

const SOCKET_PATH =
	platform === "win32"
		? "\\\\?\\pipe\\discord-ipc"
		: resolve(
				env.XDG_RUNTIME_DIR ||
					env.TMPDIR ||
					env.TMP ||
					env.TEMP ||
					"/tmp",
				"discord-ipc",
			);

let uniqueId = 0;

const encode = (type: number, data: unknown): Buffer => {
	const dataStr = JSON.stringify(data);
	const dataSize = Buffer.byteLength(dataStr);

	const buf = Buffer.alloc(dataSize + 8);
	buf.writeInt32LE(type, 0);
	buf.writeInt32LE(dataSize, 4);
	buf.write(dataStr, 8, dataSize);

	return buf;
};

const read = (socket: ExtendedSocket): void => {
	while (true) {
		let resp = socket.read(8);
		if (!resp) return;

		resp = Buffer.from(resp);
		const type = resp.readInt32LE(0);
		const dataSize = resp.readInt32LE(4);

		if (type < 0 || type >= 5) throw new Error("invalid type");

		const data = socket.read(dataSize);
		if (!data) throw new Error("failed reading data");

		const parsedData = JSON.parse(Buffer.from(data).toString());

		switch (type) {
			case IPCMessageType.PING:
				socket.emit("ping", parsedData);
				socket.write(encode(IPCMessageType.PONG, parsedData));
				break;

			case IPCMessageType.PONG:
				socket.emit("pong", parsedData);
				break;

			case IPCMessageType.HANDSHAKE:
				if (socket._handshook) throw new Error("already handshook");
				socket._handshook = true;
				socket.emit("handshake", parsedData);
				break;

			case IPCMessageType.FRAME:
				if (!socket._handshook)
					throw new Error("need to handshake first");
				socket.emit("request", parsedData);
				break;

			case IPCMessageType.CLOSE:
				socket.end();
				socket.destroy();
				return;
		}
	}
};

const socketIsAvailable = async (socket: Socket): Promise<boolean> => {
	socket.pause();
	socket.on("readable", () => {
		try {
			read(socket as ExtendedSocket);
		} catch (e: unknown) {
			log("error whilst reading", e);

			socket.end(
				encode(IPCMessageType.CLOSE, {
					code: IPCCloseCode.CLOSE_UNSUPPORTED,
					message: e instanceof Error ? e.message : "Unknown error",
				}),
			);
			socket.destroy();
		}
	});

	const stop = () => {
		try {
			socket.end();
			socket.destroy();
		} catch (e: unknown) {
			if (process.env.ARRPC_DEBUG) log("error stopping socket", e);
		}
	};

	const possibleOutcomes = Promise.race([
		new Promise((res) => socket.on("error", res)),
		new Promise((_res, rej) =>
			socket.on("pong", () => rej("socket ponged")),
		),
		new Promise((_res, rej) =>
			setTimeout(() => rej("timed out"), SOCKET_AVAILABILITY_TIMEOUT),
		),
	]).then(
		() => true,
		(e) => e,
	);

	socket.write(encode(IPCMessageType.PING, ++uniqueId));

	const outcome = await possibleOutcomes;
	stop();
	if (process.env.ARRPC_DEBUG) {
		log(
			"checked if socket is available:",
			outcome === true,
			outcome === true ? "" : `- reason: ${outcome}`,
		);
	}

	return outcome === true;
};

const getAvailableSocket = async (tries = 0): Promise<string> => {
	if (tries > IPC_MAX_RETRIES) {
		throw new Error(`ran out of tries to find socket ${tries}`);
	}

	const path = `${SOCKET_PATH}-${tries}`;
	const socket = createConnection(path);

	if (process.env.ARRPC_DEBUG) log("checking", path);

	if (await socketIsAvailable(socket)) {
		if (platform !== "win32") {
			try {
				unlinkSync(path);
			} catch (e: unknown) {
				if (process.env.ARRPC_DEBUG) log("error unlinking socket", e);
			}
		}
		return path;
	}

	log(`not available, trying again (attempt ${tries + 1})`);
	return getAvailableSocket(tries + 1);
};

export default class IPCServer {
	private handlers!: Handlers;
	private server?: Server;

	constructor(handlers: Handlers) {
		return new Promise((res) => {
			(async () => {
				this.handlers = handlers;

				this.onConnection = this.onConnection.bind(this);
				this.onMessage = this.onMessage.bind(this);

				const server = createServer(this.onConnection);
				server.on("error", (e) => {
					log("server error", e);
				});

				const socketPath = await getAvailableSocket();
				server.listen(socketPath, () => {
					log("listening at", socketPath);
					this.server = server;

					res(this as unknown as IPCServer);
				});
			})();
		}) as unknown as IPCServer;
	}

	onConnection(socket: Socket): void {
		const extSocket = socket as ExtendedSocket;
		log("new connection!");

		socket.pause();
		socket.on("readable", () => {
			try {
				read(extSocket);
			} catch (e: unknown) {
				log("error whilst reading", e);

				socket.end(
					encode(IPCMessageType.CLOSE, {
						code: IPCCloseCode.CLOSE_UNSUPPORTED,
						message:
							e instanceof Error ? e.message : "Unknown error",
					}),
				);
				socket.destroy();
			}
		});

		socket.once(
			"handshake",
			(params: { v?: string; client_id?: string }) => {
				if (process.env.ARRPC_DEBUG) log("handshake:", params);

				const ver = Number.parseInt(params.v ?? "1", 10);
				const clientId = params.client_id ?? "";

				extSocket.close = (
					code: number = IPCCloseCode.CLOSE_NORMAL,
					message = "",
				) => {
					socket.end(
						encode(IPCMessageType.CLOSE, {
							code,
							message,
						}),
					);
					socket.destroy();
				};

				if (ver !== 1) {
					log("unsupported version requested", ver);
					extSocket.close?.(IPCErrorCode.INVALID_VERSION);
					return;
				}

				if (clientId === "") {
					log("client id required");
					extSocket.close?.(IPCErrorCode.INVALID_CLIENTID);
					return;
				}

				socket.on("error", (e) => {
					log("socket error", e);
				});

				socket.on("close", (e) => {
					log("socket closed", e);
					this.handlers.close(extSocket);
				});

				socket.on("request", this.onMessage.bind(this, extSocket));

				extSocket._send = extSocket.send;
				extSocket.send = (msg: RPCMessage) => {
					if (process.env.ARRPC_DEBUG) log("sending", msg);
					socket.write(encode(IPCMessageType.FRAME, msg));
				};

				extSocket.clientId = clientId;

				this.handlers.connection(extSocket);
			},
		);
	}

	onMessage(socket: ExtendedSocket, msg: RPCMessage): void {
		if (process.env.ARRPC_DEBUG) log("message", msg);
		this.handlers.message(socket, msg);
	}
}
