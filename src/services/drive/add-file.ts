import { Buffer } from 'buffer';
import * as fs from 'fs';
import * as stream from 'stream';

import * as mongodb from 'mongodb';
import * as crypto from 'crypto';
import { storage } from 'pkgcloud';
import * as uuid from 'uuid';
import * as sharp from 'sharp';

import DriveFile, { IMetadata, getDriveFileBucket, IDriveFile } from '../../models/drive-file';
import DriveFolder from '../../models/drive-folder';
import { pack } from '../../models/drive-file';
import { publishMainStream, publishDriveStream } from '../stream';
import { isLocalUser, IUser, IRemoteUser, isRemoteUser, ITwitterUser } from '../../models/user';
import delFile from './delete-file';
import config from '../../config';
import { getDriveFileWebpublicBucket } from '../../models/drive-file-webpublic';
import { getDriveFileThumbnailBucket } from '../../models/drive-file-thumbnail';
import driveChart from '../../services/chart/drive';
import perUserDriveChart from '../../services/chart/per-user-drive';
import instanceChart from '../../services/chart/instance';
import fetchMeta from '../../misc/fetch-meta';
import generateVideoThumbnail from './generate-video-thumbnail';
import { driveLogger } from './logger';
import { IImage, convertToJpeg, convertToWebp, convertToPng } from './image-processor';
import Instance from '../../models/instance';
import { contentDisposition } from '../../misc/content-disposition';
import { detectMine } from '../../misc/detect-mine';
import { DriveConfig } from '../../config/types';
import { getDriveConfig } from '../../misc/get-drive-config';
import * as request from 'request';
import { measureVideoResoluttion } from './measure-video-resolution';
import * as S3 from 'aws-sdk/clients/s3';
import { getS3 } from './s3';

const logger = driveLogger.createSubLogger('register', 'yellow');

/***
 * Save file
 * @param path Path for original
 * @param name Name for original
 * @param type Content-Type for original
 * @param hash Hash for original
 * @param size Size for original
 * @param metadata
 */
async function save(path: string, name: string, type: string, hash: string, size: number, metadata: IMetadata, drive: DriveConfig): Promise<IDriveFile> {
	// thunbnail, webpublic を必要なら生成
	const alts = await generateAlts(path, type, !metadata.uri).catch(err => {
		logger.error(err);

		return {
			webpublic: undefined as IImage,
			thumbnail: undefined as IImage
		};
	});

	if (type === 'image/apng') type = 'image/png';

	if (drive.storage == 'minio') {
		//#region ObjectStorage params
		let [ext] = (name.match(/\.(\w+)$/) || ['']);

		if (ext === '') {
			if (type === 'image/jpeg') ext = '.jpg';
			if (type === 'image/png') ext = '.png';
			if (type === 'image/webp') ext = '.webp';
		}

		const baseUrl = drive.baseUrl
			|| `${drive.config.useSSL ? 'https' : 'http'}://${drive.config.endPoint}${drive.config.port ? `:${drive.config.port}` : ''}/${drive.bucket}`;

		// for original
		const key = `${drive.prefix}/${uuid.v4()}${ext}`;
		const url = `${baseUrl}/${key}`;

		// for alts
		let webpublicKey = null as string;
		let webpublicUrl = null as string;
		let thumbnailKey = null as string;
		let thumbnailUrl = null as string;
		//#endregion

		//#region Uploads
		logger.info(`uploading original: ${key}`);
		const uploads = [
			uploadMinio(key, fs.createReadStream(path), type, name, drive)
		];

		if (alts.webpublic) {
			webpublicKey = `${drive.prefix}/${uuid.v4()}.${alts.webpublic.ext}`;
			webpublicUrl = `${baseUrl}/${webpublicKey}`;

			logger.info(`uploading webpublic: ${webpublicKey}`);
			uploads.push(uploadMinio(webpublicKey, alts.webpublic.data, alts.webpublic.type, name, drive));
		}

		if (alts.thumbnail) {
			thumbnailKey = `${drive.prefix}/${uuid.v4()}.${alts.thumbnail.ext}`;
			thumbnailUrl = `${baseUrl}/${thumbnailKey}`;

			logger.info(`uploading thumbnail: ${thumbnailKey}`);
			uploads.push(uploadMinio(thumbnailKey, alts.thumbnail.data, alts.thumbnail.type, null, drive));
		}

		await Promise.all(uploads);
		//#endregion

		//#region DB
		Object.assign(metadata, {
			withoutChunks: true,
			storage: 'minio',
			storageProps: {
				key,
				webpublicKey,
				thumbnailKey,
			},
			url,
			webpublicUrl,
			thumbnailUrl,
		} as IMetadata);

		const file = await DriveFile.insert({
			length: size,
			uploadDate: new Date(),
			md5: hash,
			filename: name,
			metadata: metadata,
			contentType: type
		});
		//#endregion

		return file;
	} else if (drive && drive.storage == 'swift') {
		let [ext] = (name.match(/\.([a-zA-Z0-9_-]+)$/) || ['']);

		if (ext === '') {
			if (type === 'image/jpeg') ext = '.jpg';
			if (type === 'image/png') ext = '.png';
			if (type === 'image/webp') ext = '.webp';
		}

		const key = `${uuid.v4()}${ext}`;
		const url = `${config.driveUrl}/swift/${drive.container}/${key}`;

		let webpublicKey = null as string;
		let webpublicUrl = null as string;

		let thumbnailKey = null as string;
		let thumbnailUrl = null as string;

		logger.info(`uploading original: ${key}`);

		const uploads = [
			uploadSwift(key, fs.createReadStream(path), type, name, drive)
		];

		if (alts.webpublic) {
			webpublicKey = `${uuid.v4()}.${alts.webpublic.ext}`;
			webpublicUrl = `${config.driveUrl}/swift/${drive.container}/${webpublicKey}`;

			logger.info(`uploading webpublic: ${webpublicKey}`);
			uploads.push(uploadSwift(webpublicKey, alts.webpublic.data, alts.webpublic.type, name, drive));
		}

		if (alts.thumbnail) {
			thumbnailKey = `${uuid.v4()}.${alts.thumbnail.ext}`;
			thumbnailUrl = `${config.driveUrl}/swift/${drive.container}/${thumbnailKey}`;

			logger.info(`uploading thumbnail: ${thumbnailKey}`);
			uploads.push(uploadSwift(thumbnailKey, alts.thumbnail.data, alts.thumbnail.type, null, drive));
		}

		await Promise.all(uploads);

		Object.assign(metadata, {
			withoutChunks: true,
			storage: 'swift',
			storageProps: {
				key,
				webpublicKey,
				thumbnailKey,
			},
			url,
			webpublicUrl,
			thumbnailUrl,
		} as IMetadata);

		const file = await DriveFile.insert({
			length: size,
			uploadDate: new Date(),
			md5: hash,
			filename: name,
			metadata,
			contentType: type
		});

		return file;
	} else {	// use MongoDB GridFS
		// #region store original
		const originalDst = await getDriveFileBucket();

		// web用(Exif削除済み)がある場合はオリジナルにアクセス制限
		if (alts.webpublic) metadata.accessKey = uuid.v4();

		const originalFile = await storeOriginal(originalDst, name, path, type, metadata);

		logger.info(`original stored to ${originalFile._id}`);
		// #endregion store original

		// #region store webpublic
		if (alts.webpublic) {
			const webDst = await getDriveFileWebpublicBucket();
			const webFile = await storeAlts(webDst, name, alts.webpublic.data, alts.webpublic.type, originalFile._id);
			logger.info(`web stored ${webFile._id}`);
		}
		// #endregion store webpublic

		if (alts.thumbnail) {
			const thumDst = await getDriveFileThumbnailBucket();
			const thumFile = await storeAlts(thumDst, name, alts.thumbnail.data, alts.thumbnail.type, originalFile._id);
			logger.info(`web stored ${thumFile._id}`);
		}

		return originalFile;
	}
}

/**
 * Generate webpublic, thumbnail, etc
 * @param path Path for original
 * @param type Content-Type for original
 * @param generateWeb Generate webpublic or not
 */
export async function generateAlts(path: string, type: string, generateWeb: boolean) {
	// #region webpublic
	let webpublic: IImage;

	if (generateWeb) {
		logger.info(`creating web image`);

		if (['image/jpeg'].includes(type)) {
			webpublic = await convertToJpeg(path, 16384, 16384);
		} else if (['image/webp'].includes(type)) {
			webpublic = await convertToWebp(path, 16384, 16384);
		} else if (['image/png'].includes(type)) {
			webpublic = await convertToPng(path, 16384, 16384);
		} else {
			logger.info(`web image not created (not an image)`);
		}
	} else {
		logger.info(`web image not created (from remote)`);
	}
	// #endregion webpublic

	// #region thumbnail
	let thumbnail: IImage;

	if (['image/jpeg', 'image/webp'].includes(type)) {
		thumbnail = await convertToJpeg(path, 498, 280);
	} else if (['image/png'].includes(type)) {
		thumbnail = await convertToPng(path, 498, 280);
	} else if (type.startsWith('video/')) {
		try {
			thumbnail = await generateVideoThumbnail(path);
		} catch (e) {
			logger.error(`generateVideoThumbnail failed: ${e}`);
		}
	}
	// #endregion thumbnail

	return {
		webpublic,
		thumbnail,
	};
}

/**
 * Upload to ObjectStorage
 */
async function uploadMinio(key: string, stream: fs.ReadStream | Buffer, type: string, filename: string, drive: DriveConfig) {
	const params = {
		Bucket: drive.bucket,
		Key: key,
		Body: stream,
		ContentType: type,
		CacheControl: 'max-age=31536000, immutable',
	} as S3.PutObjectRequest;

	if (filename) params.ContentDisposition = contentDisposition('inline', filename);

	const s3 = getS3(drive);

	const upload = s3.upload(params);

	await upload.promise();
}

function uploadSwift(key: string, streamOrBuffer: fs.ReadStream | Buffer, type: string, filename: string, drive: DriveConfig) {
	return new Promise<void>(async (s, j) => {
		try {
			const swift = storage.createClient(drive.config);

			logger.debug('swift client created');

			const container = drive.container || 'twista';

			const containerResponse =
				await new Promise<storage.Container>(x => swift.getContainer(container, (err, container) => x(err ? null : container))) ||
				await new Promise<storage.Container>(x => swift.createContainer(container, (err, container) => x(err ? null : container)));

			if (!containerResponse)
				logger.error('failed to create container');

			logger.debug(`swift container ready: ${JSON.stringify(containerResponse)}`);

			const piped: stream.Readable = Buffer.isBuffer(streamOrBuffer) ? (x => {
				const y = new stream.PassThrough();
				y.end(x);
				return y;
			})(streamOrBuffer) : streamOrBuffer;

			piped.pipe(swift.upload({
				container,
				remote: key,
				...({
					contentType: type,
					headers: {
						...(filename ? {
							'Content-Disposition': contentDisposition('inline', filename)
						} : {})
					}
				})
			}).on('success', s)
				.on('error', j));

			logger.debug('swift file uploading');
		} catch (e) {
			j(e);
		}
	});
}

/**
 * GridFSBucketにオリジナルを格納する
 */
export async function storeOriginal(bucket: mongodb.GridFSBucket, name: string, path: string, contentType: string, metadata: any) {
	return new Promise<IDriveFile>((resolve, reject) => {
		const writeStream = bucket.openUploadStream(name, {
			contentType,
			metadata
		});

		writeStream.once('finish', resolve);
		writeStream.on('error', reject);
		fs.createReadStream(path).pipe(writeStream);
	});
}

/**
 * GridFSBucketにオリジナル以外を格納する
 */
export async function storeAlts(bucket: mongodb.GridFSBucket, name: string, data: Buffer, contentType: string, originalId: mongodb.ObjectID) {
	return new Promise<IDriveFile>((resolve, reject) => {
		const writeStream = bucket.openUploadStream(name, {
			contentType,
			metadata: {
				originalId
			}
		});

		writeStream.once('finish', resolve);
		writeStream.on('error', reject);
		writeStream.end(data);
	});
}

async function deleteOldFile(user: IRemoteUser | ITwitterUser) {
	const oldFile = await DriveFile.findOne({
		_id: {
			$nin: [user.avatarId, user.bannerId]
		},
		'metadata.userId': user._id
	}, {
		sort: {
			_id: 1
		}
	});

	if (oldFile) {
		delFile(oldFile, true);
	}
}

/**
 * Add file to drive
 *
 * @param user User who wish to add file
 * @param path File path
 * @param name Name
 * @param comment Comment
 * @param folderId Folder ID
 * @param force If set to true, forcibly upload the file even if there is a file with the same hash.
 * @param isLink Do not save file to local
 * @param url URL of source (URLからアップロードされた場合(ローカル/リモート)の元URL)
 * @param uri URL of source (リモートインスタンスのURLからアップロードされた場合の元URL)
 * @param sensitive Mark file as sensitive
 * @return Created drive file
 */
export async function addFile(
	user: IUser,
	path: string,
	name: string = null,
	comment: string = null,
	folderId: mongodb.ObjectID = null,
	force: boolean = false,
	isLink: boolean = false,
	url: string = null,
	uri: string = null,
	sensitive: boolean = false,
): Promise<IDriveFile> {
	// Calc md5 hash
	const calcHash = new Promise<string>((res, rej) => {
		const readable = fs.createReadStream(path);
		const hash = crypto.createHash('md5');
		const chunks: Buffer[] = [];
		readable
			.on('error', rej)
			.pipe(hash)
			.on('error', rej)
			.on('data', chunk => chunks.push(chunk))
			.on('end', () => {
				const buffer = Buffer.concat(chunks);
				res(buffer.toString('hex'));
			});
	});

	// Get file size
	const getFileSize = new Promise<number>((res, rej) => {
		fs.stat(path, (err, stats) => {
			if (err) return rej(err);
			res(stats.size);
		});
	});

	const [hash, [mime, ext], size] = await Promise.all([calcHash, detectMine(path), getFileSize]);

	logger.info(`hash: ${hash}, mime: ${mime}, ext: ${ext}, size: ${size}`);

	// detect name
	const detectedName = name || (ext ? `untitled.${ext}` : 'untitled');

	if (!force) {
		// Check if there is a file with the same hash
		const much = await DriveFile.findOne({
			md5: hash,
			'metadata.userId': user._id,
			'metadata.deletedAt': { $exists: false }
		});

		if (much) {
			logger.info(`file with same hash is found: ${much._id}`);
			return much;
		}
	}

	//#region Check drive usage
	if (!isLink) {
		const usage = await DriveFile
			.aggregate([{
				$match: {
					'metadata.userId': user._id,
					'metadata.deletedAt': { $exists: false }
				}
			}, {
				$project: {
					length: true
				}
			}, {
				$group: {
					_id: null,
					usage: { $sum: '$length' }
				}
			}])
			.then((aggregates: any[]) => {
				if (aggregates.length > 0) {
					return aggregates[0].usage;
				}
				return 0;
			});

		logger.debug(`drive usage is ${usage}`);

		const instance = await fetchMeta();
		const driveCapacity = 1024 * 1024 * (isLocalUser(user) ? instance.localDriveCapacityMb : instance.remoteDriveCapacityMb);

		// If usage limit exceeded
		if (usage + size > driveCapacity) {
			if (isLocalUser(user)) {
				throw 'no-free-space';
			} else {
				// (アバターまたはバナーを含まず)最も古いファイルを削除する
				deleteOldFile(user);
			}
		}
	}
	//#endregion

	const fetchFolder = async () => {
		if (!folderId) {
			return null;
		}

		const driveFolder = await DriveFolder.findOne({
			_id: folderId,
			userId: user._id
		});

		if (driveFolder == null) throw 'folder-not-found';

		return driveFolder;
	};

	const properties: {[key: string]: any} = {};

	let propPromises: Promise<void>[] = [];

	const isImage = ['image/jpeg', 'image/gif', 'image/png', 'image/webp'].includes(mime);

	if (isImage) {
		const img = sharp(path);

		// Calc width and height
		const calcWh = async () => {
			logger.debug('calculating image width and height...');

			// Calculate width and height
			const meta = await img.metadata();

			logger.debug(`image width and height is calculated: ${meta.width}, ${meta.height}`);

			properties['width'] = meta.width;
			properties['height'] = meta.height;
		};

		// Calc average color
		const calcAvg = async () => {
			logger.debug('calculating average color...');

			try {
				const info = await (img as any).stats();

				const r = Math.round(info.channels[0].mean);
				const g = Math.round(info.channels[1].mean);
				const b = Math.round(info.channels[2].mean);

				logger.debug(`average color is calculated: ${r}, ${g}, ${b}`);

				const value = info.isOpaque ? [r, g, b] : [r, g, b, 255];

				properties['avgColor'] = value;
			} catch (e) { }
		};

		propPromises = [calcWh(), calcAvg()];
	}

	const [folder, [width, height]] = await Promise.all([fetchFolder(), measureVideoResoluttion(path).catch(() => [0, 0]), Promise.all(propPromises)]);

	const metadata: IMetadata = {
		userId: user._id,
		_user: {
			host: user.host
		},
		folderId: folder !== null ? folder._id : null,
		comment,
		properties,
		...(width && height ? { width, height } : {}),
		withoutChunks: isLink,
		isRemote: isLink,
		isSensitive: (isLocalUser(user) && user.settings.alwaysMarkNsfw) || sensitive
	};

	if (url !== null) {
		metadata.src = url;

		if (isLink) {
			metadata.url = url;
		}
	}

	if (uri !== null) {
		metadata.uri = uri;
	}

	if (isLocalUser(user) && user.mastodon && !isLink && !user.mastodon.preferBoost) {
		const hostname = user.mastodon.hostname;
		const id = await new Promise<string>((s, j) => request({
			method: 'POST',
			url: `https://${hostname}/api/v1/media`,
			headers: {
				'Authorization': `Bearer ${user.mastodon.accessToken}`,
				'User-Agent': config.userAgent
			},
			formData: {
				file: fs.createReadStream(path)
			},
			json: true
		}, (err, _, body) =>
			err ? j(err) :
			body && body.error ? j(body.error) : s(body && body.id)))
			.catch(() => {});

		if (id) {
			metadata.mastodon = { hostname, id };
		}
	}

	let driveFile: IDriveFile;

	if (isLink) {
		try {
			driveFile = await DriveFile.insert({
				length: 0,
				uploadDate: new Date(),
				md5: hash,
				filename: detectedName,
				metadata: metadata,
				contentType: mime
			});
		} catch (e) {
			// duplicate key error (when already registered)
			if (e.code === 11000) {
				logger.info(`already registered ${metadata.uri}`);

				driveFile = await DriveFile.findOne({
					'metadata.uri': metadata.uri,
					'metadata.userId': user._id
				});
			} else {
				logger.error(e);
				throw e;
			}
		}
	} else {
		const drive = getDriveConfig(uri != null);
		driveFile = await (save(path, detectedName, mime, hash, size, metadata, drive));
	}

	logger.succ(`drive file has been created ${driveFile._id}`);

	pack(driveFile).then(packedFile => {
		// Publish driveFileCreated event
		publishMainStream(user._id, 'driveFileCreated', packedFile);
		publishDriveStream(user._id, 'fileCreated', packedFile);
	});

	// 統計を更新
	driveChart.update(driveFile, true);
	perUserDriveChart.update(driveFile, true);
	if (isRemoteUser(driveFile.metadata._user)) {
		instanceChart.updateDrive(driveFile, true);
		Instance.update({ host: driveFile.metadata._user.host }, {
			$inc: {
				driveUsage: driveFile.length,
				driveFiles: 1
			}
		});
	}
	return driveFile;
}
