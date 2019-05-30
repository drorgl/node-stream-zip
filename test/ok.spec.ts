import { expect } from "chai";
import fs from "fs";
import "mocha";

// import { O_TRUNC } from "constants";
import path from "path";
// import stream from "stream";
import { StreamZip } from "../src/StreamZip";
import { ZipEntry } from "../src/ZipEntry";
import { makeid, rmdirRecursive } from "./util";

// let testPathTmp;
// let testNum = 0;
const basePathTmp = "test/.tmp/";
const contentPath = "test/content/";

describe("valid zip files", () => {
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
		console.log("ok", testPathTmp);
	});

	after(async () => {
		await rmdirRecursive(testPathTmp);
	});

	async function testFileOk(file: string) {
		return new Promise<void>((resolveMain) => {

			let expandAllCount = 7;
			let expEntriesCount = 10;
			let expEntriesCountInDocDir = 4;
			if (file === "osx.zip") {
				expEntriesCount = 25;
				expEntriesCountInDocDir = 5;
				expandAllCount = 19;
			} else if (file === "windows.zip") {
				expEntriesCount = 8;
			}

			// expect(23);
			const zip = new StreamZip({ file: "test/ok/" + file });
			zip.on("ready", () => {
				expect(zip.entriesCount).to.eq(expEntriesCount);
				const entries = zip.entries();

				const containsAll = ["BSDmakefile", "README.md", "doc/api_assets/logo.svg",
					"doc/api_assets/sh.css", "doc/changelog-foot.html", "doc/sh_javascript.min.js"
				].every((expFile) => (entries[expFile]) ? true : false);
				expect(containsAll).to.eq(true);

				expect(zip.entry("not-existing-file")).to.eq(undefined);

				const entry = zip.entry("BSDmakefile");
				expect(entry).to.be.an.instanceof(ZipEntry);
				expect(entry.isDirectory).to.eq(false);
				expect(entry.isFile).to.eq(true);

				const dirEntry = zip.entry("doc/");
				const dirShouldExist = file !== "windows.zip"; // windows archives can contain not all directories
				if (dirShouldExist) {
					expect(dirEntry).to.be.an.instanceof(ZipEntry);
					expect(dirEntry.isDirectory).to.eq(true);
					expect(dirEntry.isFile).to.eq(false);
				} else {
					expect(dirEntry).to.eq(undefined);
				}

				const filePromise = new Promise((resolve) => {
					zip.extract("README.md", testPathTmp + "README.md", (err, res) => {
						expect(err).to.eq(undefined);
						expect(res).to.eq(1);
						assertFilesEqual(contentPath + "README.md", testPathTmp + "README.md");
						resolve();
					});
				});
				const fileToFolderPromise = new Promise((resolve) => {
					zip.extract("README.md", testPathTmp, (err, res) => {
						expect(err).to.eq(undefined);
						expect(res).to.eq(1);
						assertFilesEqual(contentPath + "README.md", testPathTmp + "README.md");
						resolve();
					});
				});
				const folderPromise = new Promise((resolve) => {
					zip.extract("doc/", testPathTmp, (err, res) => {
						expect(err).to.eq(undefined);
						expect(res).to.eq(expEntriesCountInDocDir);
						assertFilesEqual(contentPath + "doc/api_assets/sh.css", testPathTmp + "api_assets/sh.css");
						resolve();
					});
				});
				const extractAllPromise = new Promise((resolve) => {
					zip.extract(null, testPathTmp, (err, res) => {
						expect(err).to.eq(undefined);
						expect(res).to.eq(expandAllCount);
						assertFilesEqual(contentPath + "doc/api_assets/sh.css", testPathTmp + "doc/api_assets/sh.css");
						assertFilesEqual(contentPath + "BSDmakefile", testPathTmp + "BSDmakefile");
						resolve();
					});
				});
				const actualEentryData = zip.entryDataSync("README.md");
				const expectedEntryData = fs.readFileSync(contentPath + "README.md");
				assertBuffersEqual(actualEentryData, expectedEntryData, "sync entry");

				Promise.all([filePromise, fileToFolderPromise, folderPromise, extractAllPromise]).then(() => {
					resolveMain();
				});
			});
		});
	}

	function assertFilesEqual(actual: string, expected: string) {
		assertBuffersEqual(fs.readFileSync(actual), fs.readFileSync(expected), actual + " <> " + expected);
	}

	function assertBuffersEqual(actual: Buffer, expected: Buffer, str: string) {
		const actualData = actual.toString("utf8").replace(/\r\n/g, "\n");
		const expectedData = expected.toString("utf8").replace(/\r\n/g, "\n");
		expect(actualData).to.eq(expectedData, str);
	}

	const filesOk = fs.readdirSync("test/ok");
	for (const file of filesOk) {
		it(`should expand correctly - ${file}`, async () => {
			await testFileOk(file);
		});
	}

	describe("openEntry", () => {
		it("isok", (done) => {
			const zip = new StreamZip({ file: "test/ok/normal.zip" });
			zip.on("ready", () => {
				const entries = zip.entries();
				const entry = entries["doc/changelog-foot.html"];
				expect(entry).to.be.an.instanceof(ZipEntry);
				const entryBeforeOpen = Object.assign({}, entry);
				zip.openEntry(entry, (err, entryAfterOpen) => {
					expect(err).to.eq(undefined);
					// figure out why not working...
					// expect(entryBeforeOpen).to.deep.eq(entryAfterOpen);

					done();
				}, false);
			});
		});
	});

});
