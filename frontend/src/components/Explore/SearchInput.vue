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
  <v-text-field
    v-model="query"
    label="Search events"
    density="comfortable"
    hide-details
    variant="outlined"
    append-inner-icon="mdi-magnify"
    clearable
    @keydown.enter="emit('search', query)"
    @click:append-inner="emit('search', query)"
    @click:clear="emit('clear')"
  />
</template>

<script setup lang="ts">
import { ref, watch } from "vue";

const props = defineProps<{
  modelValue?: string;
}>();

const emit = defineEmits<{
  (e: "search", query: string): void;
  (e: "clear"): void;
  (e: "update:modelValue", value: string): void;
}>();

const query = ref(props.modelValue || "");

watch(
  () => props.modelValue,
  (val) => {
    query.value = val || "";
  },
);

watch(query, (val) => {
  emit("update:modelValue", val);
});
</script>
