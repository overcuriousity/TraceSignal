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
  <v-expansion-panel value="timelines">
    <v-expansion-panel-title>
      <v-icon start size="small">mdi-timeline</v-icon>
      Timelines
    </v-expansion-panel-title>
    <v-expansion-panel-text>
      <v-list density="compact" nav>
        <v-list-item
          v-for="timeline in timelines"
          :key="timeline.id"
          :to="`/cases/${caseId}/timelines/${timeline.id}`"
          :active="timeline.id === currentTimelineId"
          link
        >
          <v-list-item-title class="text-body-2">
            {{ timeline.name }}
          </v-list-item-title>
          <v-list-item-subtitle class="text-caption">
            {{ timeline.event_count }} events
          </v-list-item-subtitle>
        </v-list-item>
      </v-list>
    </v-expansion-panel-text>
  </v-expansion-panel>
</template>

<script setup lang="ts">
import type { Timeline } from "@/services/api";

defineProps<{
  caseId: string;
  timelines: Timeline[];
  currentTimelineId?: string;
}>();
</script>
