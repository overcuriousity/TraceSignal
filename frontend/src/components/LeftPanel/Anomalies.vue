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
  <v-expansion-panel value="anomalies">
    <v-expansion-panel-title>
      <v-icon start size="small">mdi-brain</v-icon>
      Anomalies
      <v-chip size="x-small" class="ml-2" color="warning">beta</v-chip>
    </v-expansion-panel-title>
    <v-expansion-panel-text>
      <p class="text-caption text-disabled mb-2">
        Vector-backed anomaly detection is a planned TraceVector feature.
      </p>
      <v-btn
        size="small"
        color="primary"
        block
        :loading="loading"
        @click="emit('load')"
      >
        Find outliers
      </v-btn>
      <v-list v-if="results.length" density="compact" class="mt-2">
        <v-list-item
          v-for="result in results"
          :key="result.event_id"
          :title="result.event.message"
          :subtitle="`score: ${result.score.toFixed(3)}`"
        />
      </v-list>
    </v-expansion-panel-text>
  </v-expansion-panel>
</template>

<script setup lang="ts">
import type { SimilarityResult } from "@/services/api";

defineProps<{
  results: SimilarityResult[];
  loading: boolean;
}>();

const emit = defineEmits<{
  (e: "load"): void;
}>();
</script>
