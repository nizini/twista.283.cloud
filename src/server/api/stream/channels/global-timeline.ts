import autobind from 'autobind-decorator';
import Mute from '../../../../models/mute';
import { pack } from '../../../../models/note';
import shouldMuteThisNote from '../../../../misc/should-mute-this-note';
import Channel from '../channel';
import fetchMeta from '../../../../misc/fetch-meta';

export default class extends Channel {
	public readonly chName = 'globalTimeline';
	public static shouldShare = false;
	public static requireCredential = false;

	private mutedUserIds: string[] = [];

	@autobind
	public async init(params: any) {
		const meta = await fetchMeta();
		if (meta.disableGlobalTimeline) {
			if (this.user == null || (!this.user.isAdmin && !this.user.isModerator)) return;
		}

		// Subscribe events
		this.subscriber.on('globalTimeline', this.onNote);

		const mute = await Mute.find({ muterId: this.user._id });
		this.mutedUserIds = mute.map(m => m.muteeId.toString());
	}

	@autobind
	private async onNote(note: any) {
		const { protectLocalOnlyNotes } = this.user ? { protectLocalOnlyNotes: false } : await fetchMeta();

		// リプライなら再pack
		if (note.replyId != null) {
			note.reply = await pack(note.replyId, this.user, {
				detail: true,
				unauthenticated: protectLocalOnlyNotes
			});
		}
		// Renoteなら再pack
		if (note.renoteId != null) {
			note.renote = await pack(note.renoteId, this.user, {
				detail: true,
				unauthenticated: protectLocalOnlyNotes
			});
		}

		// 流れてきたNoteがミュートしているユーザーが関わるものだったら無視する
		if (shouldMuteThisNote(note, this.mutedUserIds)) return;

		if (protectLocalOnlyNotes && note.localOnly) return;

		this.send('note', note);
	}

	@autobind
	public dispose() {
		// Unsubscribe events
		this.subscriber.off('globalTimeline', this.onNote);
	}
}
