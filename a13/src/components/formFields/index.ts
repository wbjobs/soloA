import FieldInput from './FieldInput.vue'
import FieldTextarea from './FieldTextarea.vue'
import FieldNumber from './FieldNumber.vue'
import FieldSelect from './FieldSelect.vue'
import FieldRadio from './FieldRadio.vue'
import FieldCheckbox from './FieldCheckbox.vue'
import FieldDate from './FieldDate.vue'
import FieldDateRange from './FieldDateRange.vue'
import FieldTime from './FieldTime.vue'
import FieldSwitch from './FieldSwitch.vue'
import FieldRate from './FieldRate.vue'
import FieldSlider from './FieldSlider.vue'
import FieldUpload from './FieldUpload.vue'
import FieldTable from './FieldTable.vue'
import FieldDivider from './FieldDivider.vue'
import type { FieldType } from '@/types/form'

export const fieldComponents: Record<FieldType, any> = {
  input: FieldInput,
  textarea: FieldTextarea,
  number: FieldNumber,
  select: FieldSelect,
  radio: FieldRadio,
  checkbox: FieldCheckbox,
  date: FieldDate,
  daterange: FieldDateRange,
  time: FieldTime,
  switch: FieldSwitch,
  rate: FieldRate,
  slider: FieldSlider,
  upload: FieldUpload,
  table: FieldTable,
  divider: FieldDivider,
}

export function getFieldComponent(type: FieldType): any {
  return fieldComponents[type] || FieldInput
}
