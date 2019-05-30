import { Util } from "./BufferUtil";
import { consts } from "./consts";

export class CentralDirectoryLoc64Header {
	/**
	 * ZIP64 EOCD header offset
	 *
	 * @type {number}
	 * @memberof CentralDirectoryLoc64Header
	 */
	public headerOffset: number;
	public read(data: Buffer) {
		if (data.length !== consts.ENDL64HDR || data.readUInt32LE(0) !== consts.ENDL64SIG) {
			throw new Error("Invalid zip64 central directory locator");
		}
		// ZIP64 EOCD header offset
		this.headerOffset = Util.readUInt64LE(data, consts.ENDSUB);
	}

}
