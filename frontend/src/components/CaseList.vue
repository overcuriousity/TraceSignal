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
  <v-card>
    <v-card-title>Recent investigations</v-card-title>
    <v-list>
      <v-list-item
        v-for="caseItem in cases"
        :key="caseItem.id"
        :to="`/cases/${caseItem.id}`"
        link
      >
        <template #prepend>
          <v-icon color="primary">mdi-folder-open</v-icon>
        </template>
        <v-list-item-title>{{ caseItem.name }}</v-list-item-title>
        <v-list-item-subtitle>
          {{ caseItem.description || "No description" }}
        </v-list-item-subtitle>
      </v-list-item>
      <v-list-item v-if="cases.length === 0">
        <v-list-item-title class="text-disabled">
          No cases yet.
        </v-list-item-title>
      </v-list-item>
    </v-list>
  </v-card>
</template>

<script setup lang="ts">
import type { Case } from "@/services/api";

defineProps<{
  cases: Case[];
}>();
</script>
