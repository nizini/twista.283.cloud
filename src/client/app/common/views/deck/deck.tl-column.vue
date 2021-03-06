<template>
<x-column :menu="menu" :name="name" :column="column" :is-stacked="isStacked">
	<template #header>
		<fa v-if="column.type == 'home'" :icon="['fal', 'home']"/>
		<fa v-if="column.type == 'local'" :icon="['fal', 'comments']"/>
		<fa v-if="column.type == 'hybrid'" :icon="['fal', 'share']"/>
		<fa v-if="column.type == 'imas'" :icon="['fal', 'building']"/>
		<fa v-if="column.type == 'imas'" :icon="['fal', 'city']"/>
		<fa v-if="column.type == 'global'" :icon="['fal', 'globe']"/>
		<fa v-if="column.type == 'list'" :icon="['fal', 'list']"/>
		<fa v-if="column.type == 'hashtag'" :icon="['fal', 'hashtag']"/>
		<span>{{ name }}</span>
	</template>

	<div class="editor" style="padding:12px" v-if="edit">
		<ui-switch v-model="column.isMediaOnly" @change="onChangeSettings">{{ $t('is-media-only') }}</ui-switch>
		<ui-switch v-model="column.sfwMediaOnly" @change="onChangeSettings">{{ $t('is-sfw-media-only') }}</ui-switch>
		<ui-switch v-model="column.nsfwMediaOnly" @change="onChangeSettings">{{ $t('is-nsfw-media-only') }}</ui-switch>
	</div>

	<x-list-tl v-if="column.type == 'list'"
		:list="column.list"
		:media-only="column.isMediaOnly"
		:sfwMediaOnly="column.sfwMediaOnly"
		:nsfwMediaOnly="column.nsfwMediaOnly"
		ref="tl"
	/>
	<x-hashtag-tl v-else-if="column.type == 'hashtag'"
		:tag-tl="$store.state.settings.tagTimelines.find(x => x.id == column.tagTlId)"
		:media-only="column.isMediaOnly"
		ref="tl"
	/>
	<x-tl v-else
		:src="column.type"
		:media-only="column.isMediaOnly"
		:sfwMediaOnly="column.sfwMediaOnly"
		:nsfwMediaOnly="column.nsfwMediaOnly"
		ref="tl"
	/>
</x-column>
</template>

<script lang="ts">
import Vue from 'vue';
import i18n from '../../../i18n';
import XColumn from './deck.column.vue';
import XTl from './deck.tl.vue';
import XListTl from './deck.list-tl.vue';
import XHashtagTl from './deck.hashtag-tl.vue';

export default Vue.extend({
	i18n: i18n('deck/deck.tl-column.vue'),
	components: {
		XColumn,
		XTl,
		XListTl,
		XHashtagTl
	},

	props: {
		column: {
			type: Object,
			required: true
		},
		isStacked: {
			type: Boolean,
			required: true
		}
	},

	data() {
		return {
			edit: false,
			menu: [{
				icon: ['fal', 'cog'],
				text: this.$t('edit'),
				action: () => {
					this.edit = !this.edit;
				}
			}]
		}
	},

	computed: {
		name(): string {
			if (this.column.name) return this.column.name;

			switch (this.column.type) {
				case 'home': return this.$t('@deck.home');
				case 'local': return this.$t('@deck.local');
				case 'hybrid': return this.$t('@deck.hybrid');
				case 'imas': return this.$t('@deck.imas');
				case 'imasHybrid': return this.$t('@deck.imasHybrid');
				case 'global': return this.$t('@deck.global');
				case 'list': return this.column.list.title;
				case 'hashtag': return this.$store.state.settings.tagTimelines.find(x => x.id == this.column.tagTlId).title;
			}
		}
	},

	methods: {
		onChangeSettings(v) {
			this.$store.commit('device/updateDeckColumn', this.column);
		},

		focus() {
			this.$refs.tl.focus();
		}
	}
});
</script>
