<!--
Copyright 2024 Google LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

Adapted for TraceVector from Google Timesketch frontend-v3.
-->
<template>
  <v-expansion-panel value="filters">
    <v-expansion-panel-title>
      <v-icon start size="small">mdi-filter</v-icon>
      Filters
    </v-expansion-panel-title>
    <v-expansion-panel-text>
      <v-text-field
        v-model="local.source"
        label="Source"
        density="compact"
        hide-details
        class="mb-2"
        clearable
      />
      <v-text-field
        v-model="local.tag"
        label="Tag"
        density="compact"
        hide-details
        class="mb-2"
        clearable
      />
      <v-text-field
        v-model="local.start"
        label="Start time (ISO)"
        density="compact"
        hide-details
        class="mb-2"
        clearable
        type="datetime-local"
      />
      <v-text-field
        v-model="local.end"
        label="End time (ISO)"
        density="compact"
        hide-details
        class="mb-2"
        clearable
        type="datetime-local"
      />
      <v-btn color="primary" size="small" block class="mt-2" @click="apply">
        Apply
      </v-btn>
      <v-btn variant="text" size="small" block class="mt-1" @click="reset">
        Reset
      </v-btn>
    </v-expansion-panel-text>
  </v-expansion-panel>
</template>

<script setup lang="ts">
import { reactive, watch } from "vue";
import type { FilterState } from "@/services/api";

const props = defineProps<{
  modelValue: FilterState;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: FilterState): void;
  (e: "apply"): void;
}>();

const local = reactive<FilterState>({
  source: props.modelValue.source || "",
  tag: props.modelValue.tag || "",
  start: props.modelValue.start || "",
  end: props.modelValue.end || "",
});

watch(
  () => props.modelValue,
  (val) => {
    local.source = val.source || "";
    local.tag = val.tag || "";
    local.start = val.start || "";
    local.end = val.end || "";
  },
  { deep: true },
);

function apply() {
  emit("update:modelValue", {
    source: local.source || undefined,
    tag: local.tag || undefined,
    start: local.start || undefined,
    end: local.end || undefined,
  });
  emit("apply");
}

function reset() {
  local.source = "";
  local.tag = "";
  local.start = "";
  local.end = "";
  emit("update:modelValue", {});
  emit("apply");
}
</script>
