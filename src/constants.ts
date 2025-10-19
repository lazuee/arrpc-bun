import { resolve } from "node:path";

export const BRIDGE_PORT = 1337;
export const WEBSOCKET_PORT_RANGE: [number, number] = [6463, 6472];
export const PROCESS_SCAN_INTERVAL = 5000;
export const IPC_MAX_RETRIES = 9;
export const SOCKET_AVAILABILITY_TIMEOUT = 1000;
export const DETECTABLE_DB_PATH = resolve(
	import.meta.dirname,
	"..",
	"detectable.json",
);

export enum IPCMessageType {
	HANDSHAKE = 0,
	FRAME = 1,
	CLOSE = 2,
	PING = 3,
	PONG = 4,
}

export enum IPCCloseCode {
	CLOSE_NORMAL = 1000,
	CLOSE_UNSUPPORTED = 1003,
	CLOSE_ABNORMAL = 1006,
}

export enum IPCErrorCode {
	INVALID_CLIENTID = 4000,
	INVALID_ORIGIN = 4001,
	RATELIMITED = 4002,
	TOKEN_REVOKED = 4003,
	INVALID_VERSION = 4004,
	INVALID_ENCODING = 4005,
}

export const MOCK_USER = {
	id: "1045800378228281345",
	username: "arrpc",
	discriminator: "0",
	global_name: "arRPC",
	avatar: "cfefa4d9839fb4bdf030f91c2a13e95c",
	avatar_decoration_data: null,
	bot: false,
	flags: 0,
	premium_type: 0,
} as const;
