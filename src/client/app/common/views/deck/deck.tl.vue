<template>
<div class="iwaalbte" v-if="disabled">
	<p>
		<fa :icon="faMinusCircle"/>
		{{ $t('disabled-timeline.title') }}
	</p>
	<p class="desc">{{ $t('disabled-timeline.description') }}</p>
</div>
<x-notes v-else ref="timeline" :make-promise="makePromise" :timeSplitters="[3, 6, 12, 18, 19, 20, 21, 22, 23]" @inited="() => $emit('loaded')"/>
</template>

<script lang="ts">
import Vue from 'vue';
import XNotes from './deck.notes.vue';
import { faMinusCircle } from '@fortawesome/pro-light-svg-icons';
import i18n from '../../../i18n';
import * as config from '../../../config';

const fetchLimit = 10;

export default Vue.extend({
	i18n: i18n('deck'),

	components: {
		XNotes
	},

	props: {
		src: {
			type: String,
			required: false,
			default: 'home'
		},
		mediaOnly: {
			type: Boolean,
			required: false,
			default: false
		},
		sfwMediaOnly: {
			type: Boolean,
			required: false,
			default: false
		},
		nsfwMediaOnly: {
			type: Boolean,
			required: false,
			default: false
		},
	},

	data() {
		return {
			connection: null,
			disabled: false,
			faMinusCircle,
			makePromise: null
		};
	},

	computed: {
		stream(): any {
			switch (this.src) {
				case 'home': return this.$root.stream.useSharedConnection('homeTimeline');
				case 'local': return this.$root.stream.useSharedConnection('localTimeline');
				case 'hybrid': return this.$root.stream.useSharedConnection('hybridTimeline');
				case 'imas': return this.$root.stream.useSharedConnection('imasTimeline');
				case 'imasHybrid': return this.$root.stream.useSharedConnection('imasHybridTimeline');
				case 'global': return this.$root.stream.useSharedConnection('globalTimeline');
			}
		},

		endpoint(): string {
			switch (this.src) {
				case 'home': return 'notes/timeline';
				case 'local': return 'notes/local-timeline';
				case 'hybrid': return 'notes/hybrid-timeline';
				case 'imas': return 'notes/imas-timeline';
				case 'imasHybrid': return 'notes/imas-hybrid-timeline';
				case 'global': return 'notes/global-timeline';
			}
		},
	},

	watch: {
		mediaOnly() {
			(this.$refs.timeline as any).reload();
		},
		sfwMediaOnly() {
			(this.$refs.timeline as any).reload();
		},
		nsfwMediaOnly() {
			(this.$refs.timeline as any).reload();
		},
	},

	created() {
		this.makePromise = cursor => this.$root.api(this.endpoint, {
			limit: fetchLimit + 1,
			untilId: cursor ? cursor : undefined,
			withFiles: this.mediaOnly,
			fileType: (this.sfwMediaOnly || this.nsfwMediaOnly) ? ['image/jpeg','image/png','image/gif','video/mp4'] : undefined,
			excludeNsfw: this.sfwMediaOnly,
			excludeSfw: this.nsfwMediaOnly,
			includeMyRenotes: this.$store.state.settings.showMyRenotes,
			includeRenotedMyNotes: this.$store.state.settings.showRenotedMyNotes,
			includeLocalRenotes: this.$store.state.settings.showLocalRenotes
		}).then(notes => {
			if (notes.length == fetchLimit + 1) {
				notes.pop();
				return {
					notes: notes,
					cursor: notes[notes.length - 1].id
				};
			} else {
				return {
					notes: notes,
					cursor: null
				};
			}
		});
	},

	mounted() {
		this.connection = this.stream;

		this.connection.on('note', this.onNote);
		if (this.src == 'home') {
			this.connection.on('follow', this.onChangeFollowing);
			this.connection.on('unfollow', this.onChangeFollowing);
		}

		this.$root.getMeta().then(meta => {
			this.disabled = !this.$store.state.i.isModerator && !this.$store.state.i.isAdmin && (
				meta.disableLocalTimeline && ['local', 'hybrid', 'imas', 'imasHybrid'].includes(this.src) ||
				meta.disableGlobalTimeline && ['global'].includes(this.src));
		});
	},

	beforeDestroy() {
		this.connection.dispose();
	},

	methods: {
		onNote(note) {
			if (this.mediaOnly && note.files.length == 0) return;
			if (this.sfwMediaOnly && (note.files.length == 0 || note.files.some((x: any) => x.isSensitive))) return;
			if (this.nsfwMediaOnly && (note.files.length == 0 || note.files.every((x: any) => !x.isSensitive))) return;
			(this.$refs.timeline as any).prepend(note);

			// サウンドを再生する
			if (this.$store.state.device.enableSounds && this.$store.state.device.enableSoundsInTimeline) {
				const sound = new Audio(`${config.url}/assets/post.mp3`);
				sound.volume = this.$store.state.device.soundVolume;
				sound.play();
			}
		},

		onChangeFollowing() {
			(this.$refs.timeline as any).reload();
		},

		focus() {
			(this.$refs.timeline as any).focus();
		}
	}
});
</script>

<style lang="stylus" scoped>
.iwaalbte
	color var(--text)
	text-align center

	> p
		margin 16px

		&.desc
			font-size 14px
</style>
