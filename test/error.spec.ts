import { expect } from "chai";
import fs from "fs";
import "mocha";

import { StreamZip } from "../src/StreamZip";
import { makeid, rmdirRecursive } from "./util";

const basePathTmp = "test/.tmp/";
const contentPath = "test/content/";

describe("test/err", () => {
	let testPathTmp: string = null;

	before(async () => {
		testPathTmp = basePathTmp + makeid(8) + "/";
		if (!fs.existsSync(basePathTmp)) {
			fs.mkdirSync(basePathTmp);
		}
		if (fs.existsSync(testPathTmp)) {
			await rmdirRecursive(testPathTmp);
		}
		fs.mkdirSync(testPathTmp);
	});

	after(async () => {
		await rmdirRecursive(testPathTmp);
	});

	it("enc_aes.zip", (done) => {
		const zip = new StreamZip({ file: "test/err/enc_aes.zip" });
		zip.on("ready", () => {
			zip.stream("README.md", (err) => {
				expect(err.message).to.eq("Entry encrypted");
				done();
			});
		});
	});

	it("enc_zipcrypto.zip", (done) => {
		const zip = new StreamZip({ file: "test/err/enc_zipcrypto.zip" });
		zip.on("ready", () => {
			zip.stream("README.md", (err) => {
				expect(err.message).to.eq("Entry encrypted");
				done();
			});
		});
	});

	it("lzma.zip", (done) => {
		const zip = new StreamZip({ file: "test/err/lzma.zip" });
		zip.on("ready", () => {
			zip.stream("README.md", (err) => {
				expect(err.message).to.eq("Unknown compression method: 14");
				done();
			});
		});
	});

	it("rar.rar", (done) => {
		const zip = new StreamZip({ file: "test/err/rar.rar" });
		zip.on("ready", () => {
			expect(false).to.eq("Should throw an error");
		});
		zip.on("error", (err) => {
			expect(err.message).to.eq("Bad archive");
			done();
		});
	});

	it("corrupt_entry.zip", (done) => {
		const zip = new StreamZip({ file: "test/err/corrupt_entry.zip" });
		zip.on("ready", () => {
			const oneEntry = new Promise((resolve) => {
				zip.extract("doc/api_assets/logo.svg", testPathTmp, (err) => {
					expect(err.message).to.eq("invalid distance too far back");
					resolve();
				});
			});
			const allEntries = new Promise((resolve) => {
				zip.extract("", testPathTmp, (err) => {
					expect(err.message).to.eq("invalid distance too far back");
					resolve();
				});
			});
			Promise.all([oneEntry, allEntries]).then(() => {
				done();
			});
		});
	});

	it("bad_crc.zip", (done) => {
		const zip = new StreamZip({ file: "test/err/bad_crc.zip" });
		zip.on("ready", () => {
			const oneEntry = new Promise((resolve) => {
				zip.extract("doc/api_assets/logo.svg", testPathTmp, (err) => {
					expect(err.message).to.eq("Invalid CRC");
					resolve();
				});
			});
			const allEntries = new Promise((resolve) => {
				zip.extract("", testPathTmp, (err) => {
					expect(err.message).to.not.eq(undefined);
					resolve();
				});
			});
			Promise.all([oneEntry, allEntries]).then(() => {
				done();
			});
		});
	});

	it("evil.zip", (done) => {
		const zip = new StreamZip({ file: "test/err/evil.zip" });
		zip.on("ready", () => {
			expect(false).to.eq("Should throw an error");
		});
		zip.on("error", (err) => {
			const entryName = "..\\..\\..\\..\\..\\..\\..\\..\\file.txt";
			expect(err.message).to.eq("Malicious entry: " + entryName);
			done();
		});
	});

	it("evil.zip evil entry", (done) => {
		const entryName = "..\\..\\..\\..\\..\\..\\..\\..\\file.txt";
		const zipEvil = new StreamZip({ file: "test/err/evil.zip", skipEntryNameValidation: true });
		zipEvil.on("ready", () => {
			expect(zipEvil.entry(entryName)).to.not.eq(null);
			done();
		});
	});

});
