<template>
<div class="mk-note-detail" tabindex="-1" :class="{ shadow: $store.state.device.useShadow, round: $store.state.device.roundedCorners }">
	<button
		class="more"
		v-if="appearNote.reply && appearNote.reply.replyId && conversation.length == 0"
		@click="fetchConversation"
		:disabled="conversationFetching"
	>
		<template v-if="conversationFetching"><fa :icon="['fal', 'spinner']" pulse/></template>
		<template v-else><fa :icon="['fal', 'ellipsis-v']"/></template>
	</button>
	<mk-renote class="renote" v-if="isRenote" :note="note" mini/>
	<div class="conversation">
		<x-sub v-for="note in conversation" :key="note.id" :note="note"/>
	</div>
	<div class="reply-to" v-if="appearNote.reply">
		<x-sub :note="appearNote.reply"/>
	</div>
	<article>
		<header>
			<mk-avatar class="avatar" :user="appearNote.user"/>
			<div class="names">
				<router-link class="name" :to="appearNote.user | userPage"><mk-user-name :user="appearNote.user"/></router-link>
				<span class="username"><mk-acct :user="appearNote.user"/></span>
			</div>
			<div class="via-twitter" v-if="appearNote.user.host === 'twitter.com'" :title="$t('@.twitter.note-from-twitter')"><fa :icon="['fab', 'twitter']" size="2x"/></div>
		</header>
		<div class="body">
			<p v-if="appearNote.cw" class="cw">
				<mfm v-if="appearNote.cw.length" class="text" :text="appearNote.cw" :author="appearNote.user" :i="$store.state.i" :custom-emojis="appearNote.emojis" />
				<mk-cw-button v-model="showContent" :note="appearNote"/>
			</p>
			<div class="content" v-show="!appearNote.cw || showContent">
				<div class="text">
					<span v-if="appearNote.isHidden" style="opacity:.5">({{ $t('private') }})</span>
					<span v-if="appearNote.deletedAt" style="opacity:.5">({{ $t('deleted') }})</span>
					<mfm v-if="appearNote.text" :text="appearNote.text" :author="appearNote.user" :i="$store.state.i" :custom-emojis="appearNote.emojis"/>
				</div>
				<div class="files" v-if="appearNote.files.length">
					<mk-media-list :media-list="appearNote.files" :raw="true"/>
				</div>
				<mk-poll v-if="appearNote.poll" :note="appearNote"/>
				<mk-url-preview v-for="url in urls" :url="url" :key="url" :detail="true"/>
				<a class="location" v-if="appearNote.geo" :href="`https://maps.google.com/maps?q=${appearNote.geo.coordinates[1]},${appearNote.geo.coordinates[0]}`" rel="noopener" target="_blank"><fa :icon="['fal', 'map-marker-alt']"/> {{ $t('location') }}</a>
				<div class="map" v-if="appearNote.geo" ref="map"></div>
				<div class="renote" v-if="appearNote.renote">
					<mk-note-preview :note="appearNote.renote"/>
				</div>
			</div>
		</div>
		<router-link class="time" :to="appearNote | notePage">
			<mk-time :time="appearNote.createdAt" mode="detail"/>
		</router-link>
		<div class="visibility-info">
			<span class="visibility" v-if="appearNote.visibility != 'public'">
				<fa v-if="appearNote.visibility == 'home'" :title="$t('@.note-visibility.home')" :icon="['fal', 'home']"/>
				<fa v-if="appearNote.visibility == 'followers'" :title="$t('@.note-visibility.followers')" :icon="['fal', 'unlock']"/>
				<fa v-if="appearNote.visibility == 'specified'" :title="$t('@.note-visibility.specified')" :icon="['fal', 'envelope']"/>
			</span>
			<span class="local-only" v-if="appearNote.localOnly"><fa :icon="['fal', 'shield-alt']"/></span>
			<span class="remote" :title="$t('@.note-visibility.remote-post')" v-if="appearNote.user.host"><fa :icon="['fal', 'chart-network']"/></span>
		</div>
		<footer>
			<mk-reactions-viewer :note="appearNote"/>
			<button @click="reply()" :title="$t('title')">
				<template v-if="appearNote.reply"><fa :icon="['fal', 'reply-all']"/></template>
				<template v-else><fa :icon="['fal', 'reply']"/></template>
				<p class="count" v-if="appearNote.repliesCount">{{ appearNote.repliesCount }}</p>
			</button>
			<!--
			<button v-if="appearNote.myRenoteId != null" @click="undoRenote()" title="Undo" class="renoted">
				<fa :icon="['fal', 'retweet']"/>
				<p class="count" v-if="appearNote.renoteCount">{{ appearNote.renoteCount }}</p>
			</button>
			-->
			<button v-if="['public', 'home', 'followers'].includes(appearNote.visibility)" @click="renote()" title="Renote">
				<fa :icon="['fal', 'retweet']"/>
				<p class="count" v-if="appearNote.renoteCount">{{ appearNote.renoteCount }}</p>
			</button>
			<button v-else>
				<fa :icon="['fal', 'ban']"/>
			</button>
			<button v-if="isMyNote" class="reactionButton self">
				<fa :icon="['fal', 'ban']"/>
				<p class="count" v-if="reactionsCount">{{ reactionsCount }}</p>
			</button>
			<button v-else-if="appearNote.myReaction" class="reactionButton reacted" @click="undoReact(appearNote)" ref="reactButton">
				<fa :icon="['fal', 'minus']"/>
				<p class="count" v-if="reactionsCount">{{ reactionsCount }}</p>
			</button>
			<button v-else class="reactionButton" @click="react()" ref="reactButton">
				<fa :icon="['fal', 'plus']"/>
				<p class="count" v-if="reactionsCount">{{ reactionsCount }}</p>
			</button>
			<button @click="menu()" ref="menuButton">
				<fa :icon="['fal', 'ellipsis-h']"/>
			</button>
		</footer>
	</article>
	<div class="replies" v-if="!compact">
		<x-sub v-for="note in replies" :key="note.id" :note="note"/>
	</div>
</div>
</template>

<script lang="ts">
import Vue from 'vue';
import i18n from '../../../i18n';
import XSub from './note.sub.vue';
import noteSubscriber from '../../../common/scripts/note-subscriber';
import noteMixin from '../../../common/scripts/note-mixin';

export default Vue.extend({
	i18n: i18n('mobile/views/components/note-detail.vue'),

	components: {
		XSub
	},

	mixins: [noteMixin(), noteSubscriber('note')],

	props: {
		note: {
			type: Object,
			required: true
		},
		compact: {
			default: false
		}
	},

	data() {
		return {
			showContent: false,
			conversation: [],
			conversationFetching: false,
			replies: []
		};
	},

	computed: {
		reactionsCount() {
			return Object.values(this.appearNote.reactionCounts).reduce((a, c) => a + c, 0);
		}
	},

	watch: {
		note() {
			this.fetchReplies();
		}
	},

	mounted() {
		this.fetchReplies();
	},

	methods: {
		fetchReplies() {
			if (this.compact) return;
			this.$root.api('notes/children', {
				noteId: this.appearNote.id,
				limit: 30
			}).then(replies => {
				this.replies = replies;
			});
		},

		fetchConversation() {
			this.conversationFetching = true;

			// Fetch conversation
			this.$root.api('notes/conversation', {
				noteId: this.appearNote.replyId
			}).then(conversation => {
				this.conversationFetching = false;
				this.conversation = conversation.reverse();
			});
		}
	}
});
</script>

<style lang="stylus" scoped>
.mk-note-detail
	overflow hidden
	width 100%
	text-align left
	background var(--face)

	&.round
		border-radius 8px

	&.shadow
		box-shadow 0 4px 16px rgba(#000, 0.1)

		@media (min-width 500px)
			box-shadow 0 8px 32px rgba(#000, 0.1)

	> .fetching
		padding 64px 0

	> .more
		display block
		margin 0
		padding 10px 0
		width 100%
		font-size 1em
		text-align center
		color var(--text)
		cursor pointer
		background var(--subNoteBg)
		outline none
		border none
		border-bottom solid 1px var(--faceDivider)
		border-radius 6px 6px 0 0
		box-shadow none

		&:hover
			box-shadow 0 0 0 100px inset rgba(0, 0, 0, 0.05)

		&:active
			box-shadow 0 0 0 100px inset rgba(0, 0, 0, 0.1)

	> .conversation
		> *
			border-bottom 1px solid var(--faceDivider)

	> .renote + article
		padding-top 8px

	> .reply-to
		border-bottom 1px solid var(--faceDivider)

	> article
		padding 14px 16px 9px 16px

		@media (min-width 500px)
			padding 28px 32px 18px 32px

		&:after
			content ""
			display block
			clear both

		> header
			display flex
			line-height 1.1em

			> .avatar
				display block
				flex 0 0 auto
				margin 0 12px 0 0
				width 54px
				height 54px
				border-radius 8px

				@media (min-width 500px)
					width 60px
					height 60px

			> .names

				> .name
					display inline-block
					margin .4em 0
					color var(--noteHeaderName)
					font-family fot-rodin-pron, a-otf-ud-shin-go-pr6n, sans-serif
					font-size 16px
					font-weight 600
					text-align left
					text-decoration none

					&:hover
						text-decoration underline

				> .username
					display block
					text-align left
					margin 0
					color var(--noteHeaderAcct)

			> .via-twitter
				color #4dabf7
				margin 0 0 0 auto

		> .body
			padding 8px 0

			> .cw
				cursor default
				display block
				margin 0
				padding 0
				overflow-wrap break-word
				color var(--noteText)

				> .text
					margin-right 8px

			> .content

				> .text
					display block
					margin 0
					padding 0
					overflow-wrap break-word
					font-size 16px
					color var(--noteText)

					@media (min-width 500px)
						font-size 24px

				> .renote
					margin 8px 0

					> *
						padding 16px
						border dashed 1px var(--quoteBorder)
						border-radius 8px

				> .location
					margin 4px 0
					font-size 12px
					color var(--text)

				> .map
					width 100%
					height 200px

					&:empty
						display none

				> .mk-url-preview
					margin-top 8px

				> .files
					> img
						display block
						max-width 100%

		> .time
			font-size 16px
			color var(--noteHeaderInfo)

		> .visibility-info
			color var(--noteHeaderInfo)
			display inline

			> .visibility 
				color var(--noteActionsReactionHover)

			> .local-only
				margin-left 4px
				color var(--primary)

			> .remote
				margin-left 4px
				color #4dabf7

		> footer
			font-size 1.2em

			> button
				margin 0
				padding 8px
				background transparent
				border none
				box-shadow none
				font-size 1em
				color var(--noteActions)
				cursor pointer

				&:not(:last-child)
					margin-right 28px

				&:hover
					color var(--noteActionsHover)

				> .count
					display inline
					margin 0 0 0 8px
					color var(--text)
					opacity 0.7

				&.reacted
					color var(--primary)

				&.renoted
					color var(--primary)

	> .replies
		> *
			border-top 1px solid var(--faceDivider)
</style>
