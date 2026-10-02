<script setup lang="ts">
import { t } from '../utils/i18n';
import type { ScalarFieldDefinition } from '@templify/core';
const props = defineProps<{ field: ScalarFieldDefinition; value: unknown; id: string }>();
const emit = defineEmits<{ change: [value: unknown] }>();
const labels = computed(() => ({
  string: t('string'),
  number: t('number'),
  boolean: t('boolean'),
  date: t('date'),
  datetime: t('datetime'),
  option: t('option'),
}));
const text = computed(() =>
  typeof props.value === 'string' || typeof props.value === 'number' ? String(props.value) : '',
);
</script>

<template>
  <div class="field-row">
    <label :for="id"
      ><strong>{{ field.name }}</strong
      ><span>{{ labels[field.hint.type] }}</span></label
    >
    <TSwitch
      v-if="field.hint.type === 'boolean'"
      :id="id"
      :value="Boolean(value)"
      @change="emit('change', $event)"
    />
    <TSelect
      v-else-if="field.hint.type === 'option'"
      :id="id"
      :value="text"
      creatable
      filterable
      clearable
      :options="field.hint.values.map((value) => ({ label: value, value }))"
      @change="emit('change', $event ?? '')"
    />
    <TDatePicker
      v-else-if="field.hint.type === 'date' || field.hint.type === 'datetime'"
      :id="id"
      :value="text"
      :enable-time-picker="field.hint.type === 'datetime'"
      :format="field.hint.type === 'datetime' ? 'YYYY-MM-DDTHH:mm:ss' : 'YYYY-MM-DD'"
      clearable
      @change="emit('change', $event === '' ? null : $event)"
    />
    <TInputNumber
      v-else-if="field.hint.type === 'number'"
      :id="id"
      :value="text === '' ? undefined : Number(text)"
      :allow-input-over-limit="false"
      @change="emit('change', $event === '' || $event === undefined ? null : $event)"
    />
    <TInput v-else :id="id" :value="text" @change="emit('change', $event)" />
  </div>
</template>
