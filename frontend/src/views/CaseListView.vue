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
  <DefaultLayout>
    <v-row>
      <v-col cols="12">
        <h1 class="text-h4 mb-4">Cases</h1>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12" md="6">
        <v-card>
          <v-card-title>Create case</v-card-title>
          <v-card-text>
            <v-form @submit.prevent="createCase">
              <v-text-field
                v-model="newCase.name"
                label="Case name"
                required
                density="comfortable"
              />
              <v-textarea
                v-model="newCase.description"
                label="Description (optional)"
                rows="2"
                density="comfortable"
              />
              <v-btn
                type="submit"
                color="primary"
                :loading="creating"
                :disabled="!newCase.name"
              >
                Create
              </v-btn>
            </v-form>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="6">
        <CaseList :cases="appStore.cases" />
      </v-col>
    </v-row>
  </DefaultLayout>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import DefaultLayout from "@/layouts/Default.vue";
import CaseList from "@/components/CaseList.vue";
import { useAppStore } from "@/stores/app";
import { createCase as apiCreateCase } from "@/services/api";

const appStore = useAppStore();

const creating = ref(false);
const newCase = reactive({ name: "", description: "" });

async function createCase() {
  if (!newCase.name.trim()) return;
  creating.value = true;
  try {
    await apiCreateCase(newCase.name, newCase.description || undefined);
    newCase.name = "";
    newCase.description = "";
    await appStore.loadCases();
  } finally {
    creating.value = false;
  }
}

onMounted(() => {
  appStore.loadCases();
});
</script>
