import $ from 'cafy';
import Note from '../../../../models/note';
import { packMany } from '../../../../models/note';
import define from '../../define';
import { getHideUserIds } from '../../common/get-hide-users';

export const meta = {
	desc: {
		'ja-JP': 'Featuredな投稿を取得します。',
		'en-US': 'Get featured notes.'
	},

	requireCredential: false,

	params: {
		limit: {
			validator: $.optional.num.range(1, 30),
			default: 10,
			desc: {
				'ja-JP': '最大数'
			}
		},
		days: {
			validator: $.optional.num.range(1, 1000),
			default: 2,
			desc: {
				'ja-JP': '最大数'
			}
		},
	}
};

export default define(meta, (ps, user) => new Promise(async (res, rej) => {
	const day = 1000 * 60 * 60 * 24 * ps.days;

	const hideUserIds = await getHideUserIds(user);

	const notes = await Note
		.find({
			createdAt: {
				$gt: new Date(Date.now() - day)
			},
			deletedAt: null,
			visibility: { $in: ['public', 'home'] },
			'_user.host': null,
			...(hideUserIds && hideUserIds.length > 0 ? { userId: { $nin: hideUserIds } } : {})
		}, {
			limit: ps.limit,
			sort: {
				score: -1
			},
			hint: {
				score: -1
			}
		});

	res(await packMany(notes, user));
}));
