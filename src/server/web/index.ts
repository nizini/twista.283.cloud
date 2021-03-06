/**
 * Web Client Server
 */

import ms = require('ms');
import * as Koa from 'koa';
import * as Router from 'koa-router';
import * as send from 'koa-send';
import * as favicon from 'koa-favicon';
import * as views from 'koa-views';
import { ObjectID } from 'mongodb';

import urlPreview from './url-preview';
import User, { ILocalUser } from '../../models/user';
import parseAcct from '../../misc/acct/parse';
import { parsePlain } from '../../mfm/parse';
import toText from '../../mfm/toText';
import config from '../../config';
import Note, { pack as packNote } from '../../models/note';
import getNoteSummary from '../../misc/get-note-summary';
import fetchMeta from '../../misc/fetch-meta';
import { genOpenapiSpec } from '../api/openapi/gen-spec';
import { getAtomFeed } from './feed/atom';
import { getRSSFeed } from './feed/rss';
import { getJSONFeed } from './feed/json';

const client = `${__dirname}/../../client/`;

// Init app
const app = new Koa();

// Init renderer
app.use(views(__dirname + '/views', {
	extension: 'pug',
	options: {
		config
	}
}));

// Serve favicon
app.use(favicon(`${client}/assets/favicon.ico`));

// Common request handler
app.use(async (ctx, next) => {
	// IFrameの中に入れられないようにする
	ctx.set('X-Frame-Options', 'DENY');
	await next();
});

// Init router
const router = new Router();

//#region static assets

router.get('/assets/*', async ctx => {
	await send(ctx as any, ctx.path, {
		root: client,
		maxage: ms('7 days'),
	});
});

// Apple touch icon
router.get('/apple-touch-icon.png', async ctx => {
	await send(ctx as any, '/assets/twista_icon_v1.0.png', {
		root: client
	});
});

// ServiceWorker
router.get(/^\/sw\.(.+?)\.js$/, async ctx => {
	await send(ctx as any, `/assets/sw.${ctx.params[0]}.js`, {
		root: client
	});
});

// Manifest
router.get('/manifest.json', require('./manifest'));

router.get('/robots.txt', async ctx => {
	await send(ctx as any, '/assets/robots.txt', {
		root: client
	});
});

//#endregion

// URL preview endpoint
router.get('/url', urlPreview);

router.get('/api.json', async ctx => {
	ctx.body = genOpenapiSpec();
});

// Atom
router.get('/@:user.atom', async ctx => {
	const feed = await getAtomFeed(ctx.params.user, ctx.query.until_id);

	if (feed) {
		ctx.set('Content-Type', 'application/atom+xml; charset=utf-8');
		ctx.body = feed;
	} else {
		ctx.status = 404;
	}
});

// RSS
router.get('/@:user.rss', async ctx => {
	const feed = await getRSSFeed(ctx.params.user, ctx.query.until_id);

	if (feed) {
		ctx.set('Content-Type', 'application/rss+xml; charset=utf-8');
		ctx.body = feed;
	} else {
		ctx.status = 404;
	}
});

// JSON
router.get('/@:user.json', async ctx => {
	const feed = await getJSONFeed(ctx.params.user, ctx.query.until_id);

	if (feed) {
		ctx.set('Content-Type', 'application/json; charset=utf-8');
		ctx.body = JSON.stringify(feed, null, 2);
	} else {
		ctx.status = 404;
	}
});

//#region for crawlers
// User
export const resolveUser: (user: string) => Promise<ILocalUser> = async user => ObjectID.isValid(user) &&
	await User.findOne({
		_id: new ObjectID(user),
		host: null
	}) ||
	await User.findOne({
		usernameLower: user.toLowerCase(),
		host: null
	});

router.get('/@:user', async (ctx, next) => {
	const { username, host } = parseAcct(ctx.params.user);
	const user = await User.findOne({
		usernameLower: username.toLowerCase(),
		host
	}) as ILocalUser;

	if (user != null) {
		const meta = await fetchMeta();

		const me = user.fields
			? user.fields
				.filter(filed => filed.value != null && filed.value.match(/^https?:/))
				.map(field => field.value)
			: [];

		user.name = user.name && toText(parsePlain(user.name));

		await ctx.render('user', {
			user,
			me,
			instanceName: meta.name,
			instanceDescription: meta.description
		});
		ctx.set('Cache-Control', 'public, max-age=60');
	} else {
		// リモートユーザーなので
		await next();
	}
});

router.get('/users/:user', async ctx => {
	const user = await resolveUser(ctx.params.user);

	if (user === null) {
		ctx.status = 404;
		return;
	}

	ctx.redirect(`/@${user.username}${ user.host == null ? '' : '@' + user.host}`);
});

// Note
router.get('/notes/:note', async ctx => {
	if (ObjectID.isValid(ctx.params.note)) {
		const note = await Note.findOne({ _id: ctx.params.note });

		if (note) {
			const _note = await packNote(note);
			const meta = await fetchMeta();

			let imageUrl;
			// use attached
			if (_note.files) {
				imageUrl = _note.files
					.filter((file: any) => file.type && file.type.match(/^(image|video)\//) && !file.isSensitive)
					.map((file: any) => file.thumbnailUrl)
					.shift();
			}
			// or avatar
			if (imageUrl == null || imageUrl === '') {
				imageUrl = _note.user.avatarUrl;
			}

			await ctx.render('note', {
				note: _note,
				summary: getNoteSummary(_note),
				imageUrl,
				instanceName: meta.name
			});

			if (['public', 'home'].includes(note.visibility)) {
				ctx.set('Cache-Control', 'public, max-age=180');
			} else {
				ctx.set('Cache-Control', 'private, max-age=0, must-revalidate');
			}

			return;
		}
	}

	ctx.status = 404;
});

/*
// Article
router.get('/articles/:article', async ctx => {
	if (ObjectID.isValid(ctx.params.article)) {
		const article = await Note.findOne({ _id: ctx.params.article });

		if (article) {
			const _article = await packNote(article);
			const meta = await fetchMeta();
			await ctx.render('article', {
				article: _article,
				summary: getNoteSummary(_article),
				instanceName: meta.name
			});

			if (['public', 'home'].includes(article.visibility)) {
				ctx.set('Cache-Control', 'public, max-age=180');
			} else {
				ctx.set('Cache-Control', 'private, max-age=0, must-revalidate');
			}

			return;
		}
	}

	ctx.status = 404;
});
*/

//#endregion

/*
router.get('/info', async ctx => {
	const meta = await fetchMeta();
	const emojis = await Emoji.find({ host: null }, {
		fields: {
			_id: false
		}
	});
	await ctx.render('info', {
		version: pkg.version,
		machine: os.hostname(),
		os: os.platform(),
		node: process.version,
		cpu: {
			model: os.cpus()[0].model,
			cores: os.cpus().length
		},
		emojis: emojis,
		meta: meta
	});
});
*/

const override = (source: string, target: string, depth: number = 0) =>
	[, ...target.split('/').filter(x => x), ...source.split('/').filter(x => x).splice(depth)].join('/');

router.get('/othello', async ctx => ctx.redirect(override(ctx.URL.pathname, 'games/reversi', 1)));
router.get('/reversi', async ctx => ctx.redirect(override(ctx.URL.pathname, 'games')));

// Render root index html
router.get('/', async ctx => {
	const meta = await fetchMeta();
	await ctx.render('index', {
		img: meta.bannerUrl,
		instanceName: meta.name
	});
	ctx.set('Cache-Control', 'public, max-age=300');
});

// Render base html for all requests
router.get('*', async ctx => {
	const meta = await fetchMeta();
	await ctx.render('base', {
		img: meta.bannerUrl,
		title: meta.name,
		desc: meta.description,
		icon: meta.iconUrl
	});
	ctx.set('Cache-Control', 'public, max-age=300');
});

// Register router
app.use(router.routes());

export default app;
