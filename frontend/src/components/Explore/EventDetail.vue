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
  <div>
    <v-row>
      <v-col cols="12" md="6">
        <p class="text-caption text-disabled mb-1">Message</p>
        <p class="text-body-2">{{ event.message }}</p>
      </v-col>
      <v-col cols="12" md="3">
        <p class="text-caption text-disabled mb-1">Timestamp</p>
        <p class="text-body-2">{{ event.timestamp }}</p>
        <p class="text-caption text-disabled mt-2 mb-1">Description</p>
        <p class="text-body-2">{{ event.timestamp_desc }}</p>
      </v-col>
      <v-col cols="12" md="3">
        <p class="text-caption text-disabled mb-1">Source</p>
        <v-chip size="small" @click="emit('filter-source', event.source)">
          {{ event.source }}
        </v-chip>
        <p class="text-caption text-disabled mt-2 mb-1">Display name</p>
        <p class="text-body-2">{{ event.display_name }}</p>
      </v-col>
    </v-row>
    <v-row v-if="Object.keys(event.attributes || {}).length > 0">
      <v-col cols="12">
        <p class="text-caption text-disabled mb-1">Attributes</p>
        <v-table density="compact">
          <tbody>
            <tr v-for="(value, key) in event.attributes" :key="key">
              <td class="text-caption font-weight-bold" style="width: 200px">
                {{ key }}
              </td>
              <td class="text-body-2">{{ value }}</td>
            </tr>
          </tbody>
        </v-table>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import type { EventRecord } from "@/services/api";

defineProps<{
  event: EventRecord;
}>();

const emit = defineEmits<{
  (e: "filter-source", source: string): void;
}>();
</script>
