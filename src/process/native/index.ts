// conditionally import platform-specific modules to avoid loading FFI libraries on wrong platforms
export const linux =
	process.platform === "linux" ? await import("./linux") : undefined;
export const win32 =
	process.platform === "win32" ? await import("./win32") : undefined;
export const darwin =
	process.platform === "darwin" ? await import("./darwin") : undefined;
