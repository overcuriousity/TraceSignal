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
  <v-dialog v-model="dialog" width="600">
    <template #activator="{ props: activatorProps }">
      <v-btn color="primary" v-bind="activatorProps" prepend-icon="mdi-upload">
        Upload
      </v-btn>
    </template>
    <UploadForm
      :case-id="caseId"
      :timeline-id="timelineId"
      @cancel="dialog = false"
      @uploaded="onUploaded"
    />
  </v-dialog>
</template>

<script setup lang="ts">
import { ref } from "vue";
import UploadForm from "@/components/UploadForm.vue";
import type { UploadResult } from "@/services/api";

defineProps<{
  caseId: string;
  timelineId: string;
}>();

const emit = defineEmits<{
  (e: "uploaded", result: UploadResult): void;
}>();

const dialog = ref(false);

function onUploaded(result: UploadResult) {
  dialog.value = false;
  emit("uploaded", result);
}
</script>
