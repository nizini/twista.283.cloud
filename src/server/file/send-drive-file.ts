import * as Koa from 'koa';
import * as send from 'koa-send';
import * as mongodb from 'mongodb';
import * as tmp from 'tmp';
import * as fs from 'fs';
import * as rename from 'rename';
import DriveFile, { getDriveFileBucket } from '../../models/drive-file';
import DriveFileThumbnail, { getDriveFileThumbnailBucket } from '../../models/drive-file-thumbnail';
import DriveFileWebpublic, { getDriveFileWebpublicBucket } from '../../models/drive-file-webpublic';
import { serverLogger } from '..';

import { convertToJpeg, convertToPng } from '../../services/drive/image-processor';
import { generateVideoThumbnail } from '../../services/drive/generate-video-thumbnail';
import { contentDisposition } from '../../misc/content-disposition';
import { detectMine } from '../../misc/detect-mine';
import { downloadUrl } from '../../misc/donwload-url';

const assets = `${__dirname}/../../server/file/assets/`;

const commonReadableHandlerGenerator = (ctx: Koa.BaseContext) => (e: Error): void => {
	serverLogger.error(e);
	ctx.status = 500;
};

export default async function(ctx: Koa.BaseContext) {
	// Validate id
	if (!mongodb.ObjectID.isValid(ctx.params.id)) {
		ctx.throw(400, 'incorrect id');
		return;
	}

	const fileId = new mongodb.ObjectID(ctx.params.id);

	// Fetch drive file
	const file = await DriveFile.findOne({ _id: fileId });

	if (file == null) {
		ctx.status = 404;
		await send(ctx as any, '/dummy.png', { root: assets });
		return;
	}

	if (file.metadata.withoutChunks && (file.metadata.isRemote || file.metadata._user && file.metadata._user.host != null)) {
		// urlは過去のバグで張り替え忘れている可能性があるためuriを優先する
		const url = file.metadata.uri || file.metadata.url;

		// Create temp file
		const [path, cleanup] = await new Promise<[string, any]>((res, rej) => {
			tmp.file((e, path, fd, cleanup) => {
				if (e) return rej(e);
				res([path, cleanup]);
			});
		});

		try {
			await downloadUrl(url, path);

			const [type, ext] = await detectMine(path);

			const convertFile = async () => {
				if ('thumbnail' in ctx.query) {
					if (['image/jpg', 'image/webp'].includes(type)) {
						return await convertToJpeg(path, 498, 280);
					} else if (['image/png'].includes(type)) {
						return await convertToPng(path, 498, 280);
					} else if (type.startsWith('video/')) {
						return await generateVideoThumbnail(path);
					}
				}

				return {
					data: fs.readFileSync(path),
					ext,
					type,
				};
			};

			const file = await convertFile();
			ctx.set('Content-Type', file.type);
			ctx.set('Cache-Control', 'max-age=31536000, immutable');
			ctx.body = file.data;
		} catch (e) {
			serverLogger.error(e);

			if (typeof e == 'number' && e >= 400 && e < 500) {
				ctx.status = e;
			} else {
				ctx.status = 500;
			}
		} finally {
			cleanup();
		}
		return;
	}

	if (file.metadata.deletedAt) {
		ctx.status = 410;
		await send(ctx as any, '/tombstone.png', { root: assets });
		return;
	}

	if (file.metadata.withoutChunks) {
		ctx.status = 204;
		return;
	}

	const sendRaw = async () => {
		if (file.metadata && file.metadata.accessKey && file.metadata.accessKey != ctx.query['original']) {
			ctx.status = 403;
			return;
		}

		const bucket = await getDriveFileBucket();
		const readable = bucket.openDownloadStream(fileId);
		readable.on('error', commonReadableHandlerGenerator(ctx));
		ctx.set('Content-Type', file.contentType);
		ctx.body = readable;
	};

	if ('thumbnail' in ctx.query) {
		const thumb = await DriveFileThumbnail.findOne({
			'metadata.originalId': fileId
		});

		if (thumb != null) {
			ctx.set('Content-Type', 'image/jpeg');
			ctx.set('Content-Disposition', contentDisposition('inline', `${rename(file.filename, { suffix: '-thumb', extname: '.jpeg' })}`));
			const bucket = await getDriveFileThumbnailBucket();
			ctx.body = bucket.openDownloadStream(thumb._id);
		} else {
			if (file.contentType.startsWith('image/')) {
				ctx.set('Content-Disposition', contentDisposition('inline', file.filename));
				await sendRaw();
			} else {
				ctx.status = 404;
				await send(ctx as any, '/thumbnail-not-available.png', { root: assets });
			}
		}
	} else if ('web' in ctx.query) {
		const web = await DriveFileWebpublic.findOne({
			'metadata.originalId': fileId
		});

		if (web != null) {
			ctx.set('Content-Type', file.contentType);
			ctx.set('Content-Disposition', contentDisposition('inline', `${rename(file.filename, { suffix: '-web' })}`));

			const bucket = await getDriveFileWebpublicBucket();
			ctx.body = bucket.openDownloadStream(web._id);
		} else {
			ctx.set('Content-Disposition', contentDisposition('inline', file.filename));
			await sendRaw();
		}
	} else {
		if ('download' in ctx.query) {
			ctx.set('Content-Disposition', contentDisposition('attachment', file.filename));
		}

		await sendRaw();
	}
}
