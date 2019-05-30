import fs from "fs";
import path from "path";

export function makeid(length: number) {
	let result = "";
	const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	const charactersLength = characters.length;
	for (let i = 0; i < length; i++) {
		result += characters.charAt(Math.floor(Math.random() * charactersLength));
	}
	return result;
}

async function readdir(dir: string): Promise<string[]> {
	return new Promise<string[]>((resolve, reject) => {
		fs.readdir(dir, (err, files) => {
			if (err) {
				return reject(err);
			}
			resolve(files);
		});
	});
}

async function stat(filename: string): Promise<fs.Stats> {
	return new Promise<fs.Stats>((resolve, reject) => {
		fs.stat(filename, (err, stats) => {
			if (err) {
				return reject(err);
			}
			resolve(stats);
		});
	});
}

async function rmdir(dir: string): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		fs.rmdir(dir, (err) => {
			if (err) {
				return reject(err);
			}
			resolve();
		});
	});
}

async function unlink(file: string) {
	return new Promise<void>((resolve, reject) => {
		fs.unlink(file, (err) => {
			if (err) {
				return reject(err);
			}
			resolve();
		});
	});
}

export async function rmdirRecursive(dir: string) {
	const list = await readdir(dir);
	for (const file of list) {
		const filename = path.join(dir, file);
		const stats = await stat(filename);

		if (filename === "." || filename === "..") {
			// nop
		} else if (stats.isDirectory()) {
			await rmdir(filename);
		} else {
			console.log("deleting file", filename);
			try { await unlink(filename); } catch (e) {
				// nop
				console.log("unable to delete file", filename, e);
			}
		}
	}
	try { await rmdir(dir); } catch (e) {
		// nop
		console.log("unable to delete folder", dir, e);
	}
}
