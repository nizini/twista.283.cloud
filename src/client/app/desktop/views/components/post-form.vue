<template>
<div class="mk-post-form"
	@dragover.stop="onDragover"
	@dragenter="onDragenter"
	@dragleave="onDragleave"
	@drop.stop="onDrop"
>
	<div class="content">
		<div v-if="visibility == 'specified'" class="visible-users">
			<span class="title">
				<fa :icon="['fal', 'user-friends']" class="ako"/>
				<span>{{ $t('@.send-to') }}</span>
			</span>
			<a class="visible-user" @click="removeVisibleUser(u)" v-for="u in visibleUsers">
				<div><fa :icon="['fal', 'user-minus']" fixed-width/></div>
				<span>
					<mk-avatar :user="u"/>
					<mk-user-name :user="u"/>
				</span>
			</a>
			<a @click="addVisibleUser">
				<fa :icon="['fal', 'user-plus']" class="ako"/>
			</a>
		</div>
		<div class="hashtags" v-if="recentHashtags.length && $store.state.settings.suggestRecentHashtags">
			<b>{{ $t('recent-tags') }}:</b>
			<a v-for="tag in recentHashtags.slice(0, 5)" @click="addTag(tag)" :title="$t('click-to-tagging')">#{{ tag }}</a>
		</div>
		<div class="local-only" v-if="localOnly == true">{{ $t('local-only-message') }}</div>
		<input v-show="useCw" ref="cw" v-model="cw" :placeholder="$t('annotations')" v-autocomplete="{ model: 'cw' }">
		<div class="textarea">
			<textarea :class="{ with: (files.length || poll) }"
				ref="text" v-model="text" :disabled="posting"
				@keydown="onKeydown" @paste="onPaste" :placeholder="placeholder"
				v-autocomplete="{ model: 'text' }"
			></textarea>
			<button class="emoji" @click="emoji" ref="emoji">
				<fa :icon="['fal', 'laugh']"/>
			</button>
			<x-post-form-attaches class="files" :files="files" :detachMediaFn="detachMedia"/>
			<mk-poll-editor v-if="poll" ref="poll" @destroyed="poll = false" @updated="onPollUpdate()"/>
		</div>
		<input v-show="useBroadcast" ref="broadcast" v-model="broadcast" :placeholder="$t('broadcast')" v-autocomplete="{ model: 'broadcast' }">
		<ui-select v-model="postAs" v-if="usePostAs">
			<template #label>{{ $t('post-as') }}</template>
			<option value="information">{{ $t('information') }}</option>
		</ui-select>
	</div>
	<mk-uploader ref="uploader" @uploaded="attachMedia" @change="onChangeUploadings"/>

	<footer>
		<button class="upload" :title="$t('attach-media-from-local')" @click="chooseFile"><fa :icon="['fal', 'upload']"/></button>
		<button class="drive" :title="$t('attach-media-from-drive')" @click="chooseFileFromDrive"><fa :icon="['fal', 'cloud']"/></button>
		<button class="kao" :title="$t('insert-a-kao')" @click="kao"><fa :icon="['fal', 'cat']"/></button>
		<button class="poll" :title="$t('create-poll')" @click="poll = !poll"><fa :icon="['fal', 'poll-people']"/></button>
		<button class="cw" :title="$t('hide-contents')" @click="useCw = !useCw"><fa :icon="['fal', 'eye-slash']"/></button>
		<button class="broadcast" :title="$t('use-broadcast')" @click="useBroadcast = !useBroadcast"><fa :icon="['fal', 'bullhorn']"/></button>
		<button class="post-as" :title="$t('post-as')" @click="usePostAs = !usePostAs" v-if="$store.getters.isSignedIn && ($store.state.i.isAdmin || $store.state.i.isModerator)"><fa :icon="['fal', 'user-ninja']"/></button>
		<button class="geo" :title="$t('attach-location-information')" @click="geo ? removeGeo() : setGeo()" v-if="false"><fa :icon="['fal', 'map-marker-alt']"/></button>
		<button class="rating" :title="$t('rating')" @click="setRating" ref="ratingButton">
			<span v-if="rating === null"><fa :icon="['fal', 'eye']"/></span>
			<span v-if="rating === '0'"><fa :icon="['fal', 'baby']"/></span>
			<span v-if="rating === '12'"><fa :icon="['fal', 'child']"/></span>
			<span v-if="rating === '15'"><fa :icon="['fal', 'people-carry']"/></span>
			<span v-if="rating === '18'"><fa :icon="['fal', 'person-booth']"/></span>
		</button>
		<p class="text-count" :class="{ over: trimmedLength(concatenated) > maxNoteTextLength }">{{ maxNoteTextLength - trimmedLength(concatenated) }}</p>
		<ui-buttons class="submit">
			<ui-button class="button ok" inline primary :wait="posting" :disabled="!canPost" grow="1" @click="post">
				<x-visibility-icon class="inline" :v="visibility" :localOnly="localOnly" :fixedWidth="true" :altColor="true"/>
				{{ $t('submit') }}
			</ui-button>
			<div ref="visibilityButton" :title="$t('visibility')">
				<ui-button class="button ok" inline primary :disabled="posting" shrink="1" @click="setVisibility">
					<fa :icon="['fal', 'angle-down']" fixed-width/>
				</ui-button>
			</div>
		</ui-buttons>
	</footer>

	<input ref="file" type="file" multiple="multiple" tabindex="-1" @change="onChangeFile"/>
	<div class="dropzone" v-if="draghover"></div>
</div>
</template>

<script lang="ts">
import Vue from 'vue';
import i18n from '../../../i18n';
import insertTextAtCursor from 'insert-text-at-cursor';
import getFace from '../../../common/scripts/get-face';
import MkVisibilityChooser from '../../../common/views/components/visibility-chooser.vue';
import MkRatingChooser from '../../../common/views/components/rating-chooser.vue';
import { parse } from '../../../../../mfm/parse';
import { host } from '../../../config';
import { erase, unique } from '../../../../../prelude/array';
import { length } from 'stringz';
import { toASCII } from 'punycode';
import extractMentions from '../../../../../misc/extract-mentions';
import XPostFormAttaches from '../../../common/views/components/post-form-attaches.vue';
import XVisibilityIcon from '../../../common/views/components/visibility-icon.vue';

export default Vue.extend({
	i18n: i18n('desktop/views/components/post-form.vue'),

	components: {
		MkVisibilityChooser,
		MkRatingChooser,
		XPostFormAttaches,
		XVisibilityIcon,
	},

	props: {
		reply: {
			type: Object,
			required: false
		},
		renote: {
			type: Object,
			required: false
		},
		mention: {
			type: Object,
			required: false
		},
		initialText: {
			type: String,
			required: false
		},
		initialNote: {
			type: Object,
			required: false
		},
		instant: {
			type: Boolean,
			required: false,
			default: false
		}
	},

	data() {
		return {
			posting: false,
			preview: null,
			text: '',
			files: [],
			uploadings: [],
			poll: false,
			pollChoices: [],
			pollMultiple: false,
			pollExpiration: [],
			useCw: false,
			cw: null,
			useBroadcast: false,
			broadcast: '',
			usePostAs: false,
			postAs: null,
			geo: null,
			visibility: 'public',
			visibleUsers: [],
			localOnly: false,
			rating: null,
			secondaryNoteVisibility: 'none',
			tertiaryNoteVisibility: 'none',
			autocomplete: null,
			draghover: false,
			recentHashtags: JSON.parse(localStorage.getItem('hashtags') || '[]'),
			maxNoteTextLength: 1000
		};
	},

	created() {
		this.$root.getMeta().then(meta => {
			this.maxNoteTextLength = meta.maxNoteTextLength;
		});
	},

	computed: {
		draftId(): string {
			return this.renote
				? `renote:${this.renote.id}`
				: this.reply
					? `reply:${this.reply.id}`
					: 'note';
		},

		placeholder(): string {
			const xs = [
				this.$t('@.note-placeholders.a'),
				this.$t('@.note-placeholders.b'),
				this.$t('@.note-placeholders.c'),
				this.$t('@.note-placeholders.d'),
				this.$t('@.note-placeholders.e'),
				this.$t('@.note-placeholders.f')
			];
			const x = xs[Math.floor(Math.random() * xs.length)];

			return this.renote
				? this.$t('quote-placeholder')
				: this.reply
					? this.$t('reply-placeholder')
					: x;
		},

		submitText(): string {
			return this.renote
				? this.$t('renote')
				: this.reply
					? this.$t('reply')
					: this.$t('submit');
		},

		concatenated(): string {
			return [this.text, ...(this.useBroadcast && this.broadcast && this.broadcast.length ? [this.broadcast] : [])].join(' ');
		},

		canPost(): boolean {
			return !this.posting &&
				(this.text.length || this.files.length || this.poll || this.renote) &&
				length(this.concatenated.trim()) < this.maxNoteTextLength &&
				(!this.poll || this.pollChoices.length >= 2);
		}
	},

	mounted() {
		if (this.initialText) {
			this.text = this.initialText;
		}

		if (this.mention) {
			this.text = this.mention.host ? `@${this.mention.username}@${toASCII(this.mention.host)}` : `@${this.mention.username}`;
			this.text += ' ';
		}

		if (this.reply && this.reply.user.host != null) {
			this.text = `@${this.reply.user.username}@${toASCII(this.reply.user.host)} `;
		}

		if (this.reply && this.reply.text != null) {
			const ast = parse(this.reply.text);

			for (const x of extractMentions(ast)) {
				const mention = x.host ? `@${x.username}@${toASCII(x.host)}` : `@${x.username}`;

				// 自分は除外
				if (this.$store.state.i.username == x.username && x.host == null) continue;
				if (this.$store.state.i.username == x.username && x.host == host) continue;

				// 重複は除外
				if (this.text.indexOf(`${mention} `) != -1) continue;

				this.text += `${mention} `;
			}
		}

		// デフォルト公開範囲
		this.applyVisibility(this.$store.state.settings.rememberNoteVisibility ? (this.$store.state.device.visibility || this.$store.state.settings.defaultNoteVisibility) : this.$store.state.settings.defaultNoteVisibility);

		this.secondaryNoteVisibility = this.$store.state.settings.secondaryNoteVisibility;
		this.tertiaryNoteVisibility = this.$store.state.settings.tertiaryNoteVisibility;

		// 公開以外へのリプライ時は元の公開範囲を引き継ぐ
		if (this.reply && ['home', 'followers', 'specified'].includes(this.reply.visibility)) {
			this.visibility = this.reply.visibility;
			if (this.reply.visibility === 'specified') {
				this.$root.api('users/show', {
					userIds: this.reply.visibleUserIds.filter(uid => uid !== this.$store.state.i.id && uid !== this.reply.userId)
				}).then(users => {
					this.visibleUsers.push(...users);
				});
			}
		}

		if (this.reply && this.reply.userId !== this.$store.state.i.id) {
			this.rating = this.reply.rating;
			this.$root.api('users/show', { userId: this.reply.userId }).then(user => {
				this.visibleUsers.push(user);
			});
		}

		// keep cw when reply
		if (this.$store.state.settings.keepCw && this.reply && this.reply.cw) {
			this.useCw = true;
			this.cw = this.reply.cw;
		}

		this.$nextTick(() => {
			// 書きかけの投稿を復元
			if (!this.instant && !this.mention) {
				const draft = JSON.parse(localStorage.getItem('drafts') || '{}')[this.draftId];
				if (draft) {
					this.text = draft.data.text;
					this.broadcast = draft.data.broadcast;
					this.files = draft.data.files;
					if (draft.data.poll) {
						this.poll = true;
						this.$nextTick(() => {
							(this.$refs.poll as any).set(draft.data.poll);
						});
					}
					this.$emit('change-attached-files', this.files);
				}
			}

			this.$nextTick(() => {
				if (this.initialNote) {
					// 削除して編集
					const init = this.initialNote;
					this.text =
						this.normalizedText(this.initialText) ||
						this.normalizedText(this.text) ||
						this.normalizedText(init.text) || '';
					this.files = init.files;
					this.cw = init.cw;
					this.useCw = init.cw != null;
					if (init.poll) {
						this.poll = true;
						this.$nextTick(() => {
							(this.$refs.poll as any).set({
								choices: init.poll.choices.map(c => c.text),
								multiple: init.poll.multiple
							});
						});
					}
					this.visibility = init.visibility;
					this.localOnly = init.localOnly;
					this.quoteId = init.renote ? init.renote.id : null;
				}

				this.$nextTick(() => this.watch());
			});
		});
	},

	methods: {
		normalizedText(maybeText?: string | null) {
			return typeof maybeText === 'string' && this.trimmedLength(maybeText) ? maybeText : null;
		},

		trimmedLength(text: string) {
			return length(text.trim());
		},

		addTag(tag: string) {
			insertTextAtCursor(this.$refs.text, ` #${tag} `);
		},

		watch() {
			this.$watch('text', () => this.saveDraft());
			this.$watch('poll', () => this.saveDraft());
			this.$watch('files', () => this.saveDraft());
		},

		focus() {
			(this.$refs.text as any).focus();
		},

		chooseFile() {
			(this.$refs.file as any).click();
		},

		chooseFileFromDrive() {
			this.$chooseDriveFile({
				multiple: true
			}).then(files => {
				for (const x of files) this.attachMedia(x);
			});
		},

		attachMedia(driveFile) {
			if (driveFile.error) {
				this.$notify(driveFile.error.message);
				return;
			}
			this.files.push(driveFile);
			this.$emit('change-attached-files', this.files);
		},

		detachMedia(id) {
			this.files = this.files.filter(x => x.id != id);
			this.$emit('change-attached-files', this.files);
		},

		onChangeFile() {
			for (const x of Array.from((this.$refs.file as any).files)) this.upload(x);
		},

		onPollUpdate() {
			const got = this.$refs.poll.get();
			this.pollChoices = got.choices;
			this.pollMultiple = got.multiple;
			this.pollExpiration = [got.expiration, got.expiresAt || got.expiredAfter];
			this.saveDraft();
		},

		upload(file: File, name?: string) {
			(this.$refs.uploader as any).upload(file, null, name);
		},

		onChangeUploadings(uploads) {
			this.$emit('change-uploadings', uploads);
		},

		clear() {
			this.text = '';
			this.cw = null;
			this.files = [];
			this.useCw = false;
			this.poll = false;
			this.$emit('change-attached-files', this.files);
		},

		onKeydown(e) {
			if ((e.which == 10 || e.which == 13) && (e.ctrlKey || e.metaKey) && this.canPost) this.post();
			if ((e.which == 10 || e.which == 13) && (e.altKey) && this.canPost
				&& this.secondaryNoteVisibility != null && this.secondaryNoteVisibility != 'none') this.post(this.secondaryNoteVisibility);
		},

		onPaste(e: ClipboardEvent) {
			for (const item of Array.from(e.clipboardData.items)) {
				if (item.kind == 'file') {
					const file = item.getAsFile();
					const lio = file.name.lastIndexOf('.');
					const ext = lio >= 0 ? file.name.slice(lio) : '';
					const name = `${new Date().toISOString().replace(/\D/g, '').substr(0, 14)}${ext}`;
					this.upload(file, name);
				}
			}
		},

		onDragover(e) {
			const isFile = e.dataTransfer.items[0].kind == 'file';
			const isDriveFile = e.dataTransfer.types[0] == 'mk_drive_file';
			if (isFile || isDriveFile) {
				e.preventDefault();
				this.draghover = true;
				e.dataTransfer.dropEffect = e.dataTransfer.effectAllowed == 'all' ? 'copy' : 'move';
			}
		},

		onDragenter(e) {
			this.draghover = true;
		},

		onDragleave(e) {
			this.draghover = false;
		},

		onDrop(e): void {
			this.draghover = false;

			// ファイルだったら
			if (e.dataTransfer.files.length > 0) {
				e.preventDefault();
				for (const x of Array.from(e.dataTransfer.files)) this.upload(x);
				return;
			}

			//#region ドライブのファイル
			const driveFile = e.dataTransfer.getData('mk_drive_file');
			if (driveFile != null && driveFile != '') {
				const file = JSON.parse(driveFile);
				this.files.push(file);
				this.$emit('change-attached-files', this.files);
				e.preventDefault();
			}
			//#endregion
		},

		setVisibility() {
			const w = this.$root.new(MkVisibilityChooser, {
				source: this.$refs.visibilityButton,
				currentVisibility: this.visibility,
				currentLocalOnly: this.localOnly
			});
			w.$once('chosen', v => {
				this.applyVisibility(v);
			});
		},

		setRating() {
			const w = this.$root.new(MkRatingChooser, {
				source: this.$refs.ratingButton,
				currentRating: this.rating
			});
			w.$once('chosen', v => {
				this.applyRating(v);
			});
		},

		applyVisibility(v :string) {
			const m = v.match(/^local-(.+)/);
			if (m) {
				this.localOnly = true;
				this.visibility = m[1];
			} else {
				this.localOnly = false;
				this.visibility = v;
			}
		},

		applyRating(v :string) {
			this.rating = v;
		},

		addVisibleUser() {
			this.$root.dialog({
				title: this.$t('@.enter-username'),
				user: true
			}).then(({ canceled, result: user }) => {
				if (canceled) return;
				this.visibleUsers.push(user);
			});
		},

		removeVisibleUser(user) {
			this.visibleUsers = erase(user, this.visibleUsers);
		},

		async emoji() {
			const Picker = await import('./emoji-picker-dialog.vue').then(m => m.default);
			const button = this.$refs.emoji;
			const rect = button.getBoundingClientRect();
			const vm = this.$root.new(Picker, {
				includeRemote: true,
				x: button.offsetWidth + rect.left + window.pageXOffset,
				y: rect.top + window.pageYOffset
			});
			vm.$once('chosen', (emoji: string) => {
				insertTextAtCursor(this.$refs.text, emoji + String.fromCharCode(0x200B));
			});
		},

		post(v: any, preview: boolean) {
			let visibility = this.visibility;
			let localOnly = this.localOnly;

			if (typeof v == 'string') {
				const m = v.match(/^local-(.+)/);
				if (m) {
					localOnly = true;
					visibility = m[1];
				} else {
					localOnly = false;
					visibility = v;
				}
			}

			this.posting = true;

			this.$root.api('notes/create', {
				text: this.concatenated.length ? this.concatenated : undefined,
				fileIds: this.files.length ? this.files.map(f => f.id) : undefined,
				replyId: this.reply ? this.reply.id : undefined,
				renoteId: this.renote ? this.renote.id : undefined,
				poll: this.poll ? (this.$refs.poll as any).get() : undefined,
				cw: this.useCw ? this.cw || '' : undefined,
				as: this.usePostAs && this.postAs ? this.postAs : undefined,
				visibility,
				visibleUserIds: visibility == 'specified' ? this.visibleUsers.map(u => u.id) : undefined,
				localOnly,
				rating: this.rating,
				geo: /*this.geo ? {
					coordinates: [this.geo.longitude, this.geo.latitude],
					altitude: this.geo.altitude,
					accuracy: this.geo.accuracy,
					altitudeAccuracy: this.geo.altitudeAccuracy,
					heading: isNaN(this.geo.heading) ? null : this.geo.heading,
					speed: this.geo.speed,
				} : */null
			}).then(data => {
				this.clear();
				this.deleteDraft();
				this.$emit('posted');
				this.$notify(this.renote
					? this.$t('reposted')
					: this.reply
						? this.$t('replied')
						: this.$t('posted'));
			}).catch(err => {
				this.$notify(this.renote
					? this.$t('renote-failed')
					: this.reply
						? this.$t('reply-failed')
						: this.$t('note-failed'));
			}).then(() => {
				this.posting = false;
			});

			if (this.text && this.text != '') {
				const hashtags = parse(this.text).filter(x => x.node.type === 'hashtag').map(x => x.node.props.hashtag);
				const history = JSON.parse(localStorage.getItem('hashtags') || '[]') as string[];
				localStorage.setItem('hashtags', JSON.stringify(unique(hashtags.concat(history))));
			}
		},

		saveDraft() {
			if (this.instant) return;

			const data = JSON.parse(localStorage.getItem('drafts') || '{}');

			data[this.draftId] = {
				updatedAt: new Date(),
				data: {
					text: this.text,
					broadcast: this.broadcast,
					files: this.files,
					poll: this.poll && this.$refs.poll ? (this.$refs.poll as any).get() : undefined
				}
			}

			localStorage.setItem('drafts', JSON.stringify(data));
		},

		deleteDraft() {
			const data = JSON.parse(localStorage.getItem('drafts') || '{}');

			delete data[this.draftId];

			localStorage.setItem('drafts', JSON.stringify(data));
		},

		kao() {
			this.text += getFace();
		}
	}
});
</script>

<style lang="stylus" scoped>
.mk-post-form
	display block
	padding 16px
	background var(--desktopPostFormBg)
	overflow hidden

	&:after
		content ""
		display block
		clear both

	> .content
		> input
		> .textarea > textarea
			display block
			width 100%
			padding 12px
			font-size 16px
			color var(--desktopPostFormTextareaFg)
			background var(--desktopPostFormTextareaBg)
			outline none
			border solid 1px var(--primaryAlpha01)
			border-radius 4px
			transition border-color .2s ease
			padding-right 30px

			&:hover
				border-color var(--primaryAlpha02)
				transition border-color .1s ease

			&:focus
				border-color var(--primaryAlpha05)
				transition border-color 0s ease

			&:disabled
				opacity 0.5

			&::-webkit-input-placeholder
				color var(--primaryAlpha03)

		> input:first-of-type
			margin-bottom 8px

		> input:last-of-type
			margin-top 8px

		> .ui-select
			margin 24px 8px 0

		> .textarea
			> .emoji
				position absolute
				top 0
				right 0
				padding 10px
				font-size 18px
				color var(--text)
				opacity 0.5

				&:hover
					color var(--textHighlighted)
					opacity 1

				&:active
					color var(--primary)
					opacity 1

			> textarea
				margin 0
				max-width 100%
				min-width 100%
				min-height 88px

				&:hover
					& + * + *
					& + * + * + *
						border-color var(--primaryAlpha02)
						transition border-color .1s ease

				&:focus
					& + * + *
					& + * + * + *
						border-color var(--primaryAlpha05)
						transition border-color 0s ease

					& + .emoji
						opacity 0.7

				&.with
					border-bottom solid 1px var(--primaryAlpha01) !important
					border-radius 4px 4px 0 0

			> .files
				margin 0
				padding 0
				background var(--desktopPostFormTextareaBg)
				border solid 1px var(--primaryAlpha01)
				border-top none
				border-radius 0 0 4px 4px
				transition border-color .3s ease

				&.with
					border-bottom solid 1px var(--primaryAlpha01) !important
					border-radius 0

				> .remain
					display block
					position absolute
					top 8px
					right 8px
					margin 0
					padding 0
					color var(--primaryAlpha04)

				> div
					padding 4px

					&:after
						content ""
						display block
						clear both

					> div
						float left
						border solid 4px transparent
						cursor move

						> .img
							width 64px
							height 64px
							background-size cover
							background-position center center
							background-color: rgba(128, 128, 128, 0.3)

						> .remove
							position absolute
							top -6px
							right -6px
							width 16px
							height 16px
							cursor pointer

			> .mk-poll-editor
				background var(--desktopPostFormTextareaBg)
				border solid 1px var(--primaryAlpha01)
				border-top none
				border-radius 0 0 4px 4px
				transition border-color .3s ease

		> .visible-users
			align-items center
			display flex
			flex-flow wrap
			gap 8px
			margin 0 8px 8px

			.ako
				height 32px
				margin 0 6px
				padding 6px 0
				vertical-align bottom

			> .title
				color var(--text)
				padding 0 6px 0 0

				> span
					vertical-align 4px

			> .visible-user
				align-items center
				border solid 1px
				border-radius 16px
				display flex
				height 32px
				overflow hidden

				&:hover
					> *:first-child
						padding 0 0 0 2px
						width 32px

					> *:last-child
						padding 0 2px 0 0

				> *
					align-items center
					display flex
					justify-content center
					transition all .2s ease

					&:first-child
						align-items center
						background currentColor
						display flex
						height 100%
						justify-content center
						width 0

						> svg
							color var(--secondary)
					
					&:last-child
						flex 1 0 auto
						gap 4px
						margin 0 8px
						padding 0 18px 0 16px

						> .mk-avatar
							height 24px
							width 24px

		> .hashtags
			margin 0 0 8px 0
			overflow hidden
			white-space nowrap
			font-size 14px

			> b
				color var(--primary)

			> *
				margin-right 8px
				white-space nowrap

		> .local-only
			margin 0 0 8px 0
			color var(--primary)

	> .mk-uploader
		margin 8px 0 0 0
		padding 8px
		border solid 1px var(--primaryAlpha02)
		border-radius 4px

	input[type='file']
		display none

	footer
		display flex
		align-items center
		margin-top 6px

		> .submit
			flex 0 0 auto
			margin 4px

			.inline
				display inline
			
		> .text-count
			pointer-events none
			margin 4px 4px 4px auto
			color var(--primaryAlpha05)

			&.over
				color #ec3828

		> .upload
		> .drive
		> .kao
		> .poll
		> .cw
		> .broadcast
		> .post-as
		> .geo
		> .rating
		> .visibility
			display block
			cursor pointer
			flex 0 0 40px
			font-size 1em
			color var(--text)
			background transparent
			outline none
			border solid 1px transparent
			border-radius 4px
			opacity 0.7

			&:hover
				color var(--textHighlighted)
				opacity 1.0

			&:focus
				&:after
					content ""
					pointer-events none
					position absolute
					top -5px
					right -5px
					bottom -5px
					left -5px
					border 2px solid var(--primaryAlpha03)
					border-radius 8px

	> .dropzone
		position absolute
		left 0
		top 0
		width 100%
		height 100%
		border dashed 2px var(--primaryAlpha05)
		pointer-events none
</style>
