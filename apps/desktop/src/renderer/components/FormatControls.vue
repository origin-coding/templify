<script setup lang="ts">
import type { FieldFormat } from '@templify/core';
import { t } from '../utils/i18n';
const props = defineProps<{ modelValue: FieldFormat }>();
const emit = defineEmits<{ 'update:modelValue': [value: FieldFormat] }>();
function change(key: string, value: unknown) {
  const next = { ...props.modelValue } as unknown as Record<string, unknown>;
  if (value === undefined) delete next[key];
  else next[key] = value;
  if (key === 'currency' && value === undefined) delete next.currencyDisplay;
  emit('update:modelValue', next as unknown as FieldFormat);
}
function optional(value: unknown) {
  return value === '' ? undefined : value;
}
const localeOptions = computed(() => [
  { label: t('formatInherit'), value: '' },
  { label: '中文', value: 'zh-CN' },
  { label: 'English', value: 'en' },
]);
</script>

<template>
  <div class="format-controls">
    <template v-if="modelValue.type === 'boolean'">
      <label
        >{{ t('formatTrue')
        }}<TInput :value="modelValue.trueText" @change="change('trueText', $event)"
      /></label>
      <label
        >{{ t('formatFalse')
        }}<TInput :value="modelValue.falseText" @change="change('falseText', $event)"
      /></label>
      <div class="toolbar wrap">
        <TButton
          variant="text"
          @click="emit('update:modelValue', { type: 'boolean', trueText: '是', falseText: '否' })"
          >是 / 否</TButton
        >
        <TButton
          variant="text"
          @click="emit('update:modelValue', { type: 'boolean', trueText: 'Yes', falseText: 'No' })"
          >Yes / No</TButton
        >
        <TButton
          variant="text"
          @click="emit('update:modelValue', { type: 'boolean', trueText: '☑', falseText: '☐' })"
          >☑ / ☐</TButton
        >
      </div>
    </template>
    <template v-else>
      <label
        >{{ t('formatLocale')
        }}<TSelect
          :value="modelValue.locale ?? ''"
          :options="localeOptions"
          @change="change('locale', optional($event))"
      /></label>
      <template v-if="modelValue.type === 'date' || modelValue.type === 'datetime'">
        <label
          >{{ t('formatPattern')
          }}<TInput
            :value="modelValue.pattern ?? ''"
            :placeholder="modelValue.type === 'date' ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH:mm:ss'"
            @change="change('pattern', optional($event))"
        /></label>
        <div class="toolbar wrap">
          <TButton
            v-for="pattern in modelValue.type === 'date'
              ? ['YYYY-MM-DD', 'YYYY年MM月DD日', 'DD/MM/YYYY']
              : ['YYYY-MM-DD HH:mm:ss', 'YYYY年MM月DD日 HH:mm']"
            :key="pattern"
            variant="text"
            @click="change('pattern', pattern)"
            >{{ pattern }}</TButton
          >
        </div>
        <label v-if="modelValue.type === 'datetime'"
          >{{ t('formatTimeZone')
          }}<TInput
            :value="modelValue.timeZone ?? ''"
            placeholder="Asia/Shanghai"
            @change="change('timeZone', optional($event))"
        /></label>
      </template>
      <template v-else-if="modelValue.type === 'number'">
        <label
          >{{ t('formatGrouping')
          }}<TSelect
            :value="modelValue.useGrouping === undefined ? '' : String(modelValue.useGrouping)"
            :options="[
              { label: t('formatInherit'), value: '' },
              { label: t('formatOn'), value: 'true' },
              { label: t('formatOff'), value: 'false' },
            ]"
            @change="change('useGrouping', $event === '' ? undefined : $event === 'true')"
        /></label>
        <label
          >{{ t('formatMinDigits')
          }}<TInputNumber
            :value="modelValue.minimumFractionDigits"
            :min="0"
            :max="100"
            :decimal-places="0"
            :allow-input-over-limit="false"
            @change="change('minimumFractionDigits', $event ?? undefined)"
        /></label>
        <label
          >{{ t('formatMaxDigits')
          }}<TInputNumber
            :value="modelValue.maximumFractionDigits"
            :min="0"
            :max="100"
            :decimal-places="0"
            @change="change('maximumFractionDigits', $event ?? undefined)"
        /></label>
        <label
          >{{ t('formatCurrency')
          }}<TInput
            :value="modelValue.currency ?? ''"
            placeholder="CNY / USD / EUR"
            @change="change('currency', optional($event))"
        /></label>
        <label v-if="modelValue.currency"
          >{{ t('formatCurrencyDisplay')
          }}<TSelect
            :value="modelValue.currencyDisplay ?? 'symbol'"
            :options="
              ['symbol', 'narrowSymbol', 'code', 'name'].map((value) => ({
                label: t(
                  value === 'symbol'
                    ? 'formatSymbol'
                    : value === 'narrowSymbol'
                      ? 'formatNarrowSymbol'
                      : value === 'code'
                        ? 'formatCode'
                        : 'formatName',
                ),
                value,
              }))
            "
            @change="change('currencyDisplay', $event)"
        /></label>
      </template>
    </template>
  </div>
</template>
