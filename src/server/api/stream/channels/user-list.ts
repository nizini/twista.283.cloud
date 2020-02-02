import autobind from 'autobind-decorator';
import Channel from '../channel';
import { pack } from '../../../../models/note';
import fetchMeta from '../../../../misc/fetch-meta';

export default class extends Channel {
	public readonly chName = 'userList';
	public static shouldShare = false;
	public static requireCredential = false;

	@autobind
	public async init(params: any) {
		const listId = params.listId as string;

		// Subscribe stream
		this.subscriber.on(`userListStream:${listId}`, async data => {
			const { protectLocalOnlyNotes } = this.user ? { protectLocalOnlyNotes: false } : await fetchMeta();

			// 再パック
			if (data.type == 'note') {
				data.body = await pack(data.body.id, this.user, {
					detail: true,
					unauthenticated: protectLocalOnlyNotes
				});

				if (protectLocalOnlyNotes && data.body.localOnly) return;
			}

			this.send(data);
		});
	}
}
