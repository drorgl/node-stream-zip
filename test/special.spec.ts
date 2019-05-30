import { expect } from "chai";
import fs from "fs";
import "mocha";
import { makeid, rmdirRecursive } from "./util";

// import { O_TRUNC } from "constants";
import path from "path";
// import stream from "stream";
import { StreamZip } from "../src/StreamZip";
import { ZipEntry } from "../src/ZipEntry";

// let testPathTmp;
// let testNum = 0;
const basePathTmp = "test/.tmp/";
const contentPath = "test/content/";

describe("test/special", () => {
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
		console.log("special", testPathTmp);
	});

	after(async () => {
		await rmdirRecursive(testPathTmp);
	});

	it("tiny.zip", (done) => {

		const zip = new StreamZip({ file: "test/special/tiny.zip" });
		zip.on("ready", () => {
			const actualEentryData = zip.entryDataSync("BSDmakefile").toString("utf8");
			expect(actualEentryData.substr(0, 4)).to.eq("all:");
			done();
		});
	});

	it("zip64.zip", (done) => {
		const zip = new StreamZip({ file: "test/special/zip64.zip" });
		zip.on("ready", () => {
			const internalZip = zip.entryDataSync("files.zip");
			const filesZipTmp = testPathTmp + "files.zip";
			fs.writeFileSync(filesZipTmp, internalZip);
			const filesZip = new StreamZip({ file: filesZipTmp, storeEntries: true });
			filesZip.on("ready", () => {
				expect(66667).to.eq(filesZip.entriesCount);
				done();
			});
		});
	});
});
