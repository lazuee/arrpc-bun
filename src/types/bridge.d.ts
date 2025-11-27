export interface BridgeMessage {
	type: string;
	data?: { games?: string[] };
}
