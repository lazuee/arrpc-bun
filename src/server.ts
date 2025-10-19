import { EventEmitter } from "node:events";
import { MOCK_USER } from "./constants";
import ProcessServer from "./process/index";
import IPCServer from "./transports/ipc";
import WSServer from "./transports/websocket";
import type {
	ActivityPayload,
	ExtendedSocket,
	ExtendedWebSocket,
	Handlers,
	InviteArgs,
	RPCMessage,
	SetActivityArgs,
} from "./types/index.d.ts";
import { createLogger } from "./utils";

const log = createLogger("server", 87, 242, 135);

let socketId = 0;

function sendMessage(
	socket: ExtendedSocket | ExtendedWebSocket,
	msg: RPCMessage,
): void {
	if ("send" in socket && socket.send) {
		socket.send(msg);
	}
}

export default class RPCServer extends EventEmitter {
	private ipc?: IPCServer;
	private ws?: WSServer;
	private process?: ProcessServer;

	async shutdown(): Promise<void> {
		log("shutting down...");
		this.removeAllListeners();
	}

	constructor() {
		super();
		return (async () => {
			this.onConnection = this.onConnection.bind(this);
			this.onMessage = this.onMessage.bind(this);
			this.onClose = this.onClose.bind(this);

			const handlers: Handlers = {
				connection: this.onConnection,
				message: this.onMessage,
				close: this.onClose,
			};

			this.ipc = await new IPCServer(handlers);
			this.ws = await new WSServer(handlers);

			if (
				!process.argv.includes("--no-process-scanning") &&
				!process.env.ARRPC_NO_PROCESS_SCANNING
			) {
				this.process = await new ProcessServer(handlers);
			}

			return this;
		})() as unknown as RPCServer;
	}

	onConnection(socket: ExtendedSocket | ExtendedWebSocket): void {
		const id = socketId++;
		socket.socketId = id;

		if (process.env.ARRPC_DEBUG) {
			log(
				"new connection",
				`socket #${id}`,
				`clientId: ${socket.clientId || "unknown"}`,
			);
		}

		sendMessage(socket, {
			cmd: "DISPATCH",
			data: {
				v: 1,
				config: {
					cdn_host: "cdn.discordapp.com",
					api_endpoint: "//discord.com/api",
					environment: "production",
				},
				user: MOCK_USER,
			},
			evt: "READY",
			nonce: null,
		});

		this.emit("connection", socket);
	}

	onClose(socket: ExtendedSocket | ExtendedWebSocket): void {
		this.emit("activity", {
			activity: null,
			pid: socket.lastPid,
			socketId: socket.socketId?.toString() ?? "0",
		} as ActivityPayload);

		this.emit("close", socket);
	}

	async onMessage(
		socket: ExtendedSocket | ExtendedWebSocket,
		{ cmd, args, nonce }: RPCMessage,
	): Promise<void> {
		if (process.env.ARRPC_DEBUG) {
			log(
				"message received",
				`socket #${socket.socketId}`,
				`cmd: ${cmd}`,
				`nonce: ${nonce}`,
			);
		}

		this.emit("message", { socket, cmd, args, nonce });

		switch (cmd) {
			case "CONNECTIONS_CALLBACK":
				sendMessage(socket, {
					cmd,
					data: {
						code: 1000,
					},
					evt: "ERROR",
					nonce,
				});
				break;

			case "SET_ACTIVITY": {
				const setActivityArgs = args as SetActivityArgs;
				const { activity, pid } = setActivityArgs;

				if (!activity) {
					sendMessage(socket, {
						cmd,
						data: null,
						evt: null,
						nonce,
					});

					this.emit("activity", {
						activity: null,
						pid,
						socketId: socket.socketId?.toString() ?? "0",
					} as ActivityPayload);
					return;
				}

				const { buttons, timestamps, instance } = activity;

				socket.lastPid = pid ?? socket.lastPid;

				const metadata: { button_urls?: string[] } = {};
				const extra: { buttons?: string[] } = {};

				if (buttons) {
					metadata.button_urls = buttons.map(
						(x: { url: string; label: string }) => x.url,
					);
					extra.buttons = buttons.map((x) => x.label);
				}

				if (timestamps) {
					for (const x in timestamps) {
						const key = x as keyof typeof timestamps;
						const value = timestamps[key];
						if (
							value &&
							Date.now().toString().length - value.toString().length > 2
						) {
							timestamps[key] = Math.floor(1000 * value);
						}
					}
				}

				if (process.env.ARRPC_DEBUG) {
					log("emitting activity event");
				}
				this.emit("activity", {
					activity: {
						application_id: socket.clientId,
						type: 0,
						metadata,
						flags: instance ? 1 << 0 : 0,
						...activity,
						...extra,
					},
					pid,
					socketId: socket.socketId?.toString() ?? "0",
				} as ActivityPayload);

				sendMessage(socket, {
					cmd,
					data: {
						...activity,
						name: "",
						application_id: socket.clientId,
						type: 0,
					},
					evt: null,
					nonce,
				});

				break;
			}

			case "GUILD_TEMPLATE_BROWSER":
			case "INVITE_BROWSER": {
				const inviteArgs = args as InviteArgs;
				const { code } = inviteArgs;

				const isInvite = cmd === "INVITE_BROWSER";
				const callback = (isValid = true) => {
					sendMessage(socket, {
						cmd,
						data: isValid
							? { code }
							: {
									code: isInvite ? 4011 : 4017,
									message: `Invalid ${isInvite ? "invite" : "guild template"} id: ${code}`,
								},
						evt: isValid ? null : "ERROR",
						nonce,
					});
				};

				this.emit(isInvite ? "invite" : "guild-template", code, callback);
				break;
			}

			case "DEEP_LINK": {
				const deep_callback = (success: boolean) => {
					sendMessage(socket, {
						cmd,
						data: null,
						evt: success ? null : "ERROR",
						nonce,
					});
				};
				this.emit("link", args, deep_callback);
				break;
			}
		}
	}
}
