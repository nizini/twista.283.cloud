<template>
<div class="icozogqfvdetwohsdglrbswgrejoxbdj" v-if="video.isSensitive && hide && !$store.state.device.alwaysShowNsfw" @click="hide = false">
	<div>
		<b><fa :icon="['fal', 'exclamation-triangle']"/> {{ $t('sensitive') }}</b>
		<span>{{ $t('click-to-show') }}</span>
	</div>
</div>
<a class="kkjnbbplepmiyuadieoenjgutgcmtsvu" v-else
	:href="href"
	rel="nofollow noopener"
	target="_blank"
	:style="imageStyle"
	:title="video.name"
>
	<div>
		<fa :icon="['fal', 'play-circle']"/>
	</div>
</a>
</template>

<script lang="ts">
import Vue from 'vue';
import i18n from '../../../i18n';
import { query } from '../../../../../prelude/url';

export default Vue.extend({
	i18n: i18n('mobile/views/components/media-video.vue'),
	props: {
		video: {
			type: Object,
			required: true
		}
	},
	data() {
		return {
			hide: true
		};
	},
	computed: {
		href(): string {
			return window[Symbol.for(':urn:x:twista:is:on:ios:like')] && (!this.$store.getters.isSignedIn || this.$store.state.device.useVlc) ?
				`vlc-x-callback://x-callback-url/download?${query({ url: this.video.url })}` :
				this.video.url;
		},
		imageStyle(): any {
			return {
				'background-image': `url(${this.video.thumbnailUrl})`
			};
		}
	}
});
</script>

<style lang="stylus" scoped>
.kkjnbbplepmiyuadieoenjgutgcmtsvu
	display flex
	justify-content center
	align-items center

	font-size 3.5em
	overflow hidden
	background-position center
	background-size cover
	width 100%
	height 100%

	> div
		align-items center
		background var(--modalBackdrop)
		border-radius 6px
		display flex
		height 96px
		justify-content center
		width 96px

.icozogqfvdetwohsdglrbswgrejoxbdj
	display flex
	justify-content center
	align-items center
	background #111
	color #fff

	> div
		display table-cell
		text-align center
		font-size 12px

		> b
			display block
</style>
