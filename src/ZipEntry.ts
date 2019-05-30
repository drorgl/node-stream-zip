import { Util } from "./BufferUtil";
import { consts } from "./consts";
// region ZipEntry

function toBits(dec: number, size: number) {
	let b = (dec >>> 0).toString(2);
	while (b.length < size) {
		b = "0" + b;
	}
	return b.split("");
}

function parseZipTime(timeBytes: number, dateBytes: number) {
	const timeBits = toBits(timeBytes, 16);
	const dateBits = toBits(dateBytes, 16);

	const mt = {
		h: parseInt(timeBits.slice(0, 5).join(""), 2),
		m: parseInt(timeBits.slice(5, 11).join(""), 2),
		s: parseInt(timeBits.slice(11, 16).join(""), 2) * 2,
		Y: parseInt(dateBits.slice(0, 7).join(""), 2) + 1980,
		M: parseInt(dateBits.slice(7, 11).join(""), 2),
		D: parseInt(dateBits.slice(11, 16).join(""), 2),
	};
	const dt_str = [mt.Y, mt.M, mt.D].join("-") + " " + [mt.h, mt.m, mt.s].join(":") + " GMT+0";
	return new Date(dt_str).getTime();
}

export class ZipEntry {
	public verMade: number;
	public version: number;
	public flags: number;
	public method: number;
	public time: number;
	public crc: number;
	public compressedSize: number;
	public size: number;
	public fnameLen: number;
	public extraLen: number;
	public comLen: number;
	public diskStart: number;
	public inattr: number;
	public attr: number;
	public offset: number;
	public name: string;
	public isDirectory: boolean;
	public comment: string;
	public headerOffset: number;

	public readHeader(data: Buffer, offset: number) {
		// data should be 46 bytes and start with "PK 01 02"
		if (data.length < offset + consts.CENHDR || data.readUInt32LE(offset) !== consts.CENSIG) {
			throw new Error("Invalid entry header");
		}
		// version made by
		this.verMade = data.readUInt16LE(offset + consts.CENVEM);
		// version needed to extract
		this.version = data.readUInt16LE(offset + consts.CENVER);
		// encrypt, decrypt flags
		this.flags = data.readUInt16LE(offset + consts.CENFLG);
		// compression method
		this.method = data.readUInt16LE(offset + consts.CENHOW);
		// modification time (2 bytes time, 2 bytes date)
		const timeBytes = data.readUInt16LE(offset + consts.CENTIM);
		const dateBytes = data.readUInt16LE(offset + consts.CENTIM + 2);
		this.time = parseZipTime(timeBytes, dateBytes);

		// uncompressed file crc-32 value
		this.crc = data.readUInt32LE(offset + consts.CENCRC);
		// compressed size
		this.compressedSize = data.readUInt32LE(offset + consts.CENSIZ);
		// uncompressed size
		this.size = data.readUInt32LE(offset + consts.CENLEN);
		// filename length
		this.fnameLen = data.readUInt16LE(offset + consts.CENNAM);
		// extra field length
		this.extraLen = data.readUInt16LE(offset + consts.CENEXT);
		// file comment length
		this.comLen = data.readUInt16LE(offset + consts.CENCOM);
		// volume number start
		this.diskStart = data.readUInt16LE(offset + consts.CENDSK);
		// internal file attributes
		this.inattr = data.readUInt16LE(offset + consts.CENATT);
		// external file attributes
		this.attr = data.readUInt32LE(offset + consts.CENATX);
		// LOC header offset
		this.offset = data.readUInt32LE(offset + consts.CENOFF);
	}

	public readDataHeader(data: Buffer) {
		// 30 bytes and should start with "PK\003\004"
		if (data.readUInt32LE(0) !== consts.LOCSIG) {
			throw new Error("Invalid local header");
		}
		// version needed to extract
		this.version = data.readUInt16LE(consts.LOCVER);
		// general purpose bit flag
		this.flags = data.readUInt16LE(consts.LOCFLG);
		// compression method
		this.method = data.readUInt16LE(consts.LOCHOW);
		// modification time (2 bytes time ; 2 bytes date)
		const timeBytes = data.readUInt16LE(consts.LOCTIM);
		const dateBytes = data.readUInt16LE(consts.LOCTIM + 2);
		this.time = parseZipTime(timeBytes, dateBytes);

		// uncompressed file crc-32 value
		this.crc = data.readUInt32LE(consts.LOCCRC) || this.crc;
		// compressed size
		const compressedSize = data.readUInt32LE(consts.LOCSIZ);
		if (compressedSize && compressedSize !== consts.EF_ZIP64_OR_32) {
			this.compressedSize = compressedSize;
		}
		// uncompressed size
		const size = data.readUInt32LE(consts.LOCLEN);
		if (size && size !== consts.EF_ZIP64_OR_32) {
			this.size = size;
		}
		// filename length
		this.fnameLen = data.readUInt16LE(consts.LOCNAM);
		// extra field length
		this.extraLen = data.readUInt16LE(consts.LOCEXT);
	}

	public read(data: Buffer, offset: number) {
		this.name = data.slice(offset, offset += this.fnameLen).toString();
		const lastChar = data[offset - 1];
		this.isDirectory = (lastChar === 47) || (lastChar === 92);

		if (this.extraLen) {
			this.readExtra(data, offset);
			offset += this.extraLen;
		}
		this.comment = this.comLen ? data.slice(offset, offset + this.comLen).toString() : null;
	}

	public validateName() {
		if (/\\|^\w+:|^\/|(^|\/)\.\.(\/|$)/.test(this.name)) {
			throw new Error("Malicious entry: " + this.name);
		}
	}

	public readExtra(data: Buffer, offset: number) {
		let signature;
		let size;
		const  maxPos = offset + this.extraLen;
		while (offset < maxPos) {
			signature = data.readUInt16LE(offset);
			offset += 2;
			size = data.readUInt16LE(offset);
			offset += 2;
			if (consts.ID_ZIP64 === signature) {
				this.parseZip64Extra(data, offset, size);
			}
			offset += size;
		}
	}

	public parseZip64Extra(data: Buffer, offset: number, length: number) {
		if (length >= 8 && this.size === consts.EF_ZIP64_OR_32) {
			this.size = Util.readUInt64LE(data, offset);
			offset += 8; length -= 8;
		}
		if (length >= 8 && this.compressedSize === consts.EF_ZIP64_OR_32) {
			this.compressedSize = Util.readUInt64LE(data, offset);
			offset += 8; length -= 8;
		}
		if (length >= 8 && this.offset === consts.EF_ZIP64_OR_32) {
			this.offset = Util.readUInt64LE(data, offset);
			offset += 8; length -= 8;
		}
		if (length >= 4 && this.diskStart === consts.EF_ZIP64_OR_16) {
			this.diskStart = data.readUInt32LE(offset);
			offset += 4; length -= 4;
		}
	}

	public get encrypted() {
		return (this.flags & consts.FLG_ENTRY_ENC) === consts.FLG_ENTRY_ENC;
	}

	public get isFile() {
		return !this.isDirectory;
	}
}
