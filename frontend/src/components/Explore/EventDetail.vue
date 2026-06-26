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
        <FieldRow
          label="Message"
          field-key="message"
          :value="event.message"
          @filter="emit('filter-field', $event)"
          @exclude="emit('exclude-field', $event)"
          @copy="copyValue"
        />
      </v-col>
      <v-col cols="12" md="3">
        <FieldRow
          label="Timestamp"
          field-key="timestamp"
          :value="event.timestamp"
          @filter="emit('filter-field', $event)"
          @exclude="emit('exclude-field', $event)"
          @copy="copyValue"
        />
        <FieldRow
          label="Description"
          field-key="timestamp_desc"
          :value="event.timestamp_desc"
          class="mt-3"
          @filter="emit('filter-field', $event)"
          @exclude="emit('exclude-field', $event)"
          @copy="copyValue"
        />
      </v-col>
      <v-col cols="12" md="3">
        <FieldRow
          label="Source"
          field-key="source"
          :value="event.source"
          @filter="emit('filter-field', $event)"
          @exclude="emit('exclude-field', $event)"
          @copy="copyValue"
        />
        <FieldRow
          label="Display name"
          field-key="display_name"
          :value="event.display_name"
          class="mt-3"
          @filter="emit('filter-field', $event)"
          @exclude="emit('exclude-field', $event)"
          @copy="copyValue"
        />
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
              <td class="text-right" style="width: 120px">
                <v-btn
                  icon="mdi-filter-plus"
                  variant="text"
                  density="compact"
                  size="small"
                  title="Filter for this value"
                  @click="emit('filter-field', { key, value })"
                />
                <v-btn
                  icon="mdi-filter-minus"
                  variant="text"
                  density="compact"
                  size="small"
                  title="Exclude this value"
                  @click="emit('exclude-field', { key, value })"
                />
                <v-btn
                  icon="mdi-content-copy"
                  variant="text"
                  density="compact"
                  size="small"
                  title="Copy value"
                  @click="copyValue(value)"
                />
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-col>
    </v-row>

    <!-- Annotations section -->
    <v-row>
      <v-col cols="12">
        <p class="text-caption text-disabled mb-1">Annotations</p>
        <v-table v-if="annotations.length > 0" density="compact" class="mb-2">
          <tbody>
            <tr v-for="ann in annotations" :key="ann.id">
              <td style="width: 32px">
                <v-icon
                  size="small"
                  :color="ann.annotation_type === 'tag' ? 'secondary' : 'default'"
                >
                  {{
                    ann.annotation_type === "tag"
                      ? "mdi-account-tag"
                      : "mdi-comment-text"
                  }}
                </v-icon>
              </td>
              <td class="text-body-2">{{ ann.content }}</td>
              <td class="text-right" style="width: 48px">
                <v-btn
                  icon="mdi-close"
                  variant="text"
                  density="compact"
                  size="small"
                  color="error"
                  title="Delete annotation"
                  @click="emit('delete-annotation', ann.id)"
                />
              </td>
            </tr>
          </tbody>
        </v-table>
        <p v-else class="text-caption text-disabled mb-2">No annotations yet.</p>
        <div class="d-flex gap-2">
          <v-text-field
            v-model="newAnnotationContent"
            density="compact"
            hide-details
            placeholder="Add tag or comment…"
            style="max-width: 300px"
            @keydown.enter.prevent="addTag"
          />
          <v-btn
            size="small"
            variant="tonal"
            color="secondary"
            prepend-icon="mdi-account-tag"
            :disabled="!newAnnotationContent.trim()"
            @click="addTag"
          >
            Tag
          </v-btn>
          <v-btn
            size="small"
            variant="tonal"
            prepend-icon="mdi-comment-plus"
            :disabled="!newAnnotationContent.trim()"
            @click="addComment"
          >
            Comment
          </v-btn>
        </div>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { Annotation, EventRecord } from "@/services/api";
import FieldRow from "@/components/Explore/FieldRow.vue";

defineProps<{
  event: EventRecord;
  annotations: Annotation[];
}>();

const emit = defineEmits<{
  (e: "filter-field", payload: { key: string; value: string }): void;
  (e: "exclude-field", payload: { key: string; value: string }): void;
  (e: "add-annotation", payload: { type: "comment" | "tag"; content: string }): void;
  (e: "delete-annotation", annotationId: string): void;
}>();

const newAnnotationContent = ref("");

function addTag() {
  const content = newAnnotationContent.value.trim();
  if (!content) return;
  emit("add-annotation", { type: "tag", content });
  newAnnotationContent.value = "";
}

function addComment() {
  const content = newAnnotationContent.value.trim();
  if (!content) return;
  emit("add-annotation", { type: "comment", content });
  newAnnotationContent.value = "";
}

async function copyValue(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // Clipboard may be unavailable; ignore silently.
  }
}
</script>
