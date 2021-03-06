/**
 * Core Server
 */

import * as fs from 'fs';
import * as http from 'http';
import * as http2 from 'http2';
import * as https from 'https';
import * as zlib from 'zlib';
import * as Koa from 'koa';
import * as Router from 'koa-router';
import * as mount from 'koa-mount';
import * as compress from 'koa-compress';
import * as koaLogger from 'koa-logger';
import * as requestStats from 'request-stats';
import * as slow from 'koa-slow';

import activityPub from './activitypub';
import nodeinfo from './nodeinfo';
import ostatus from './ostatus';
import wellKnown from './well-known';
import config from '../config';
import networkChart from '../services/chart/network';
import apiServer from './api';
import apiStreamingServer from './api/streaming';
import fileServer from './file';
import proxyServer from './proxy';
import webServer from './web';
import { sum } from '../prelude/array';
import User from '../models/user';
import Logger from '../services/logger';
import { program } from '../argv';
import Emoji from '../models/emoji';
import { lib, ordered } from 'emojilib';
import { twemojiBase } from '../misc/twemoji-base';
import Instance from '../models/instance';

export const serverLogger = new Logger('server', 'gray', false);

// Init app
const app = new Koa();
app.proxy = true;

if (!['production', 'test'].includes(process.env.NODE_ENV)) {
	// Logger
	app.use(koaLogger(str => {
		serverLogger.info(str);
	}));

	// Delay
	if (program.slow) {
		app.use(slow({
			delay: 3000
		}));
	}
}

// Compress response
app.use(compress({
	flush: zlib.constants.Z_SYNC_FLUSH
}));

// HSTS
// 6months (15552000sec)
if (config.url.startsWith('https') && !config.disableHsts) {
	app.use(async (ctx, next) => {
		ctx.set('strict-transport-security', 'max-age=15552000; preload');
		await next();
	});
}

app.use(mount('/api', apiServer));
app.use(mount('/files', fileServer));
app.use(mount('/proxy', proxyServer));

// Init router
const router = new Router();

// Routing
router.use(activityPub().routes());
router.use(nodeinfo.routes());
router.use(ostatus.routes());
router.use(wellKnown.routes());

router.get('/assets/emojis/:query', async ctx => {
	const query: string = ctx.params.query;

	if (query.startsWith('@')) {
		const [, username, host = null] = query.split('@');
		const user = await User.findOne({
			usernameLower: username.toLowerCase(),
			host
		});

		if (user)
			ctx.redirect(user.avatarUrl || `${config.driveUrl}/default-avatar.jpg`);
		else
			ctx.status = 404;
	} else {
		const [name, host = null] = query.split('@');

		if (host) {
			const blocking = await Instance.find({ isBlocked: true });

			if (blocking.map(x => x.host).includes(host)) {
				ctx.status = 403;

				return;
			}
		}

		const emoji = await Emoji.findOne({
			host,
			$or: [
				{ name },
				{
					aliases: { $in: [name] }
				}
			]
		});

		if (emoji)
			ctx.redirect(emoji.url);
		else if (ordered.includes(name)) {
			const runed = [...lib[name].char].map(x => x.codePointAt(0).toString(16));
			ctx.redirect(`${twemojiBase}/2/svg/${((runed.includes('200d') ? runed : runed.filter(x => x !== 'fe0f')).filter(x => x && x.length)).join('-')}.svg`);
		} else
			ctx.status = 404;
	}
});

router.get('/verify-email/:code', async ctx => {
	const user = await User.findOne({ emailVerifyCode: ctx.params.code });

	if (user != null) {
		ctx.body = 'Verify succeeded!';
		ctx.status = 200;

		User.update({ _id: user._id }, {
			$set: {
				emailVerified: true,
				emailVerifyCode: null
			}
		});
	} else {
		ctx.status = 404;
	}
});

// Register router
app.use(router.routes());

app.use(mount(webServer));

function createServer() {
	if (config.https) {
		const certs: any = {};
		for (const k of Object.keys(config.https)) {
			certs[k] = fs.readFileSync(config.https[k]);
		}
		certs['allowHTTP1'] = true;
		return http2.createSecureServer(certs, app.callback()) as https.Server;
	} else {
		return http.createServer(app.callback());
	}
}

// For testing
export const startServer = () => {
	const server = createServer();

	// Init stream server
	apiStreamingServer(server as http.Server);

	// Listen
	server.listen(config.port);

	return server;
};

export default () => new Promise(resolve => {
	const server = createServer();

	// Init stream server
	apiStreamingServer(server as http.Server);

	// Listen
	server.listen(config.port, resolve);

	//#region Network stats
	let queue: any[] = [];

	requestStats(server, (stats: any) => {
		if (stats.ok) {
			queue.push(stats);
		}
	});

	// Bulk write
	setInterval(() => {
		if (queue.length == 0) return;

		const requests = queue.length;
		const time = sum(queue.map(x => x.time));
		const incomingBytes = sum(queue.map(x => x.req.byets));
		const outgoingBytes = sum(queue.map(x => x.res.byets));
		queue = [];

		networkChart.update(requests, time, incomingBytes, outgoingBytes);
	}, 5000);
	//#endregion
});
