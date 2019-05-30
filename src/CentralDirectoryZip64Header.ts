import { Util } from "./BufferUtil";
import { consts } from "./consts";

export class CentralDirectoryZip64Header {
	/**
	 * number of entries on this volume
	 *
	 * @type {number}
	 * @memberof CentralDirectoryZip64Header
	 */
	public volumeEntries: number;
	/**
	 * total number of entries
	 *
	 * @type {number}
	 * @memberof CentralDirectoryZip64Header
	 */
	public totalEntries: number;
	/**
	 * central directory size in bytes
	 *
	 * @type {number}
	 * @memberof CentralDirectoryZip64Header
	 */
	public size: number;
	/**
	 * offset of first CEN header
	 *
	 * @type {number}
	 * @memberof CentralDirectoryZip64Header
	 */
	public offset: number;

	public read(data: Buffer) {
		if (data.length !== consts.END64HDR || data.readUInt32LE(0) !== consts.END64SIG) {
			throw new Error("Invalid central directory");
		}
		// number of entries on this volume
		this.volumeEntries = Util.readUInt64LE(data, consts.END64SUB);
		// total number of entries
		this.totalEntries = Util.readUInt64LE(data, consts.END64TOT);
		// central directory size in bytes
		this.size = Util.readUInt64LE(data, consts.END64SIZ);
		// offset of first CEN header
		this.offset = Util.readUInt64LE(data, consts.END64OFF);
	}

}
