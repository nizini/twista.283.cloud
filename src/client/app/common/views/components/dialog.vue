<template>
<div class="felqjxyj" :class="{ splash }">
	<div class="bg" ref="bg" @click="onBgClick" :class="type"></div>
	<div class="main" ref="main">
		<template v-if="type == 'signin'">
			<mk-signin/>
		</template>
		<template v-else>
			<div class="icon" v-if="!input && !select && !user" :class="type"><fa :icon="icon"/></div>
			<header v-if="title && asHtml" v-html="title"></header>
			<header v-else-if="title">{{ title }}</header>
			<div class="body" v-if="text && asHtml" v-html="text"></div>
			<div class="body" v-else-if="text">{{ text }}</div>
			<ui-input v-if="input" v-model="inputValue" autofocus :type="input.type || 'text'" :placeholder="input.placeholder" @keydown="onInputKeydown"></ui-input>
			<ui-input v-if="user" v-model="userInputValue" autofocus @keydown="onInputKeydown"><template #prefix>@</template></ui-input>
			<ui-select v-if="select" v-model="selectedValue" autofocus>
				<option v-for="item in select.items" :value="item.value" :key="item.value">{{ item.text }}</option>
			</ui-select>
			<div class="footer" v-if="leftFooter || rightFooter">
				<small>{{ leftFooter }}</small>
				<small>{{ rightFooter }}</small>
			</div>
			<ui-horizon-group no-grow class="buttons fit-bottom" v-if="!splash">
				<ui-button @click="ok" primary :autofocus="!input && !select && !user">{{ (showCancelButton || input || select || user) ? $t('@.ok') : $t('@.got-it') }}</ui-button>
				<ui-button @click="cancel" v-if="showCancelButton || input || select || user">{{ $t('@.cancel') }}</ui-button>
			</ui-horizon-group>
		</template>
	</div>
</div>
</template>

<script lang="ts">
import Vue from 'vue';
import anime from 'animejs';
import { faTimesCircle, faQuestionCircle, faBellExclamation } from '@fortawesome/pro-light-svg-icons';
import parseAcct from "../../../../../misc/acct/parse";
import i18n from '../../../i18n';

export default Vue.extend({
	i18n: i18n(),
	props: {
		type: {
			type: String,
			required: false,
			default: 'info'
		},
		title: {
			type: String,
			required: false
		},
		text: {
			type: String,
			required: false
		},
		asHtml: {
			type: Boolean,
			default: true
		},
		leftFooter: {
			type: String,
			required: false
		},
		rightFooter: {
			type: String,
			required: false
		},
		input: {
			required: false
		},
		select: {
			required: false
		},
		user: {
			required: false
		},
		showCancelButton: {
			type: Boolean,
			default: false
		},
		splash: {
			type: Boolean,
			default: false
		}
	},

	data() {
		return {
			inputValue: this.input && this.input.default ? this.input.default : null,
			userInputValue: null,
			selectedValue: null
		};
	},

	computed: {
		icon(): any {
			switch (this.type) {
				case 'success': return ['fal', 'check'];
				case 'error': return faTimesCircle;
				case 'warning': return ['fal', 'exclamation-triangle'];
				case 'info': return ['fal', 'info-circle'];
				case 'question': return faQuestionCircle;
				case 'emergency': return faBellExclamation;
			}
		}
	},

	mounted() {
		this.$nextTick(() => {
			(this.$refs.bg as any).style.pointerEvents = 'auto';
			anime({
				targets: this.$refs.bg,
				opacity: 1,
				duration: 100,
				easing: 'linear'
			});

			anime({
				targets: this.$refs.main,
				opacity: 1,
				scale: [1.2, 1],
				duration: 300,
				easing: 'cubicBezier(0, 0.5, 0.5, 1)'
			});

			if (this.splash) {
				setTimeout(() => {
					this.close();
				}, 1000);
			}
		});
	},

	methods: {
		async ok() {
			if (this.user) {
				const user = await this.$root.api('users/show', parseAcct(this.userInputValue));
				if (user) {
					this.$emit('ok', user);
					this.close();
				}
			} else {
				const result =
					this.input ? this.inputValue :
					this.select ? this.selectedValue :
					true;
				this.$emit('ok', result);
				this.close();
			}
		},

		cancel() {
			this.$emit('cancel');
			this.close();
		},

		close() {
			this.$el.style.pointerEvents = 'none';
			(this.$refs.bg as any).style.pointerEvents = 'none';
			(this.$refs.main as any).style.pointerEvents = 'none';

			anime({
				targets: this.$refs.bg,
				opacity: 0,
				duration: 300,
				easing: 'linear'
			});
			anime({
				targets: this.$refs.main,
				opacity: 0,
				scale: 0.8,
				duration: 300,
				easing: 'cubicBezier(0, 0.5, 0.5, 1)',
				complete: () => this.destroyDom()
			});
		},

		onBgClick() {
			this.cancel();
		},

		onInputKeydown(e) {
			if (e.which == 13) { // Enter
				e.preventDefault();
				e.stopPropagation();
				this.ok();
			}
		}
	}
});
</script>

<style lang="stylus" scoped>
.felqjxyj
	display flex
	align-items center
	justify-content center
	position fixed
	z-index 30000
	top 0
	left 0
	width 100%
	height 100%

	&.splash
		> .main
			min-width 0
			width initial

	> .bg
		display block
		position fixed
		top 0
		left 0
		width 100%
		height 100%
		background rgba(#000, 0.7)
		opacity 0
		pointer-events none

		&.emergency
			background rgba(#800, 0.7)

	> .main
		display block
		position fixed
		margin auto
		padding 32px
		min-width 320px
		max-width 480px
		width calc(100% - 32px)
		text-align center
		background var(--secondary)
		border-radius 8px
		color var(--faceText)
		opacity 0

		> .icon
			font-size 32px

			&.success
				color #37ec92

			&.error
			&.emergency
				color #ec4137

			&.warning
				color #ecb637

			> *
				display block
				margin 0 auto

			& + header
				margin-top 16px

		> header
			margin 0 0 8px 0
			font-family fot-rodin-pron, a-otf-ud-shin-go-pr6n, sans-serif
			font-weight 600
			font-size 20px

			& + .body
				margin-top 8px

		> .body
			margin 16px 0
			white-space pre-line

		> .footer
			display flex
			flex-wrap wrap
			justify-content space-between
			opacity .7

			> small
				display inline-block

				&:first-child
					margin 0 auto 0 0

				&:last-child
					margin 0 0 0 auto

		> .buttons
			margin-top 16px
</style>
