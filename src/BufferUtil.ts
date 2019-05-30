import { consts } from "./consts";
// region Util

export class Util {
	public static readUInt64LE(buffer: Buffer, offset: number) {
		return (buffer.readUInt32LE(offset + 4) * 0x0000000100000000) + buffer.readUInt32LE(offset);
	}
}

// endregion
