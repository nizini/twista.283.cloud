import autobind from 'autobind-decorator';
import Mute from '../../../../models/mute';
import { pack } from '../../../../models/note';
import shouldIgnoreThisNote from '../../../../misc/should-ignore-this-note';
import Channel from '../channel';
import Blocking from '../../../../models/blocking';
import { concat } from '../../../../prelude/array';
import UserList from '../../../../models/user-list';

export default class extends Channel {
	public readonly chName = 'homeTimeline';
	public static shouldShare = true;
	public static requireCredential = true;

	private ignoredUserIds: string[] = [];
	private hideFromUsers: string[] = [];

	@autobind
	public async init(params: any) {
		// Subscribe events
		this.subscriber.on(`homeTimeline:${this.user._id}`, this.onNote);

		const mute = await Mute.find({ muterId: this.user._id });
		const blocking = await Blocking.find({ blockerId: this.user._id });
		this.ignoredUserIds = [
			...mute.map(x => x.muteeId.toHexString()),
			...blocking.map(x => x.blockeeId.toHexString())
		];

		// Homeから隠すリストユーザー
		const lists = await UserList.find({
			userId: this.user._id,
			hideFromHome: true,
		});

		this.hideFromUsers = concat(lists.map(list => list.userIds)).map(x => x.toString());
	}

	@autobind
	private async onNote(note: any) {
		// リプライなら再pack
		if (note.replyId != null) {
			note.reply = await pack(note.replyId, this.user, {
				detail: true
			});
		}
		// Renoteなら再pack
		if (note.renoteId != null) {
			note.renote = await pack(note.renoteId, this.user, {
				detail: true
			});
		}

		// 流れてきたNoteがミュートしているユーザーが関わるものだったら無視する
		if (await shouldIgnoreThisNote(note, this.ignoredUserIds, this.hideFromUsers)) return;

		this.send('note', note);
	}

	@autobind
	public dispose() {
		// Unsubscribe events
		this.subscriber.off(`homeTimeline:${this.user._id}`, this.onNote);
	}
}
