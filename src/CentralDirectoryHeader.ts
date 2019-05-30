import { consts } from "./consts";
// region CentralDirectoryHeader

export class CentralDirectoryHeader {
	public volumeEntries: number;
	public totalEntries: number;
	public size: number;
	public offset: number;
	public commentLength: number;
	public headerOffset: number;

	public read(data: Buffer) {
		if (data.length !== consts.ENDHDR || data.readUInt32LE(0) !== consts.ENDSIG) {
			throw new Error("Invalid central directory");
		}
		// number of entries on this volume
		this.volumeEntries = data.readUInt16LE(consts.ENDSUB);
		// total number of entries
		this.totalEntries = data.readUInt16LE(consts.ENDTOT);
		// central directory size in bytes
		this.size = data.readUInt32LE(consts.ENDSIZ);
		// offset of first CEN header
		this.offset = data.readUInt32LE(consts.ENDOFF);
		// zip file comment length
		this.commentLength = data.readUInt16LE(consts.ENDCOM);
	}

}
// endregion
