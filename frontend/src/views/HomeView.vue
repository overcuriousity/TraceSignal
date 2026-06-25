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
    <v-row justify="center">
      <v-col cols="12" md="10" lg="8">
        <v-sheet class="pa-6 mb-6" color="surface" rounded>
          <h1 class="text-h4 mb-2">TraceVector</h1>
          <p class="text-body-1 text-disabled mb-4">
            Local-first, forensic-grade log investigation with vector-backed
            anomaly detection.
          </p>
          <v-btn
            color="primary"
            size="large"
            to="/cases"
            prepend-icon="mdi-briefcase"
          >
            Open Cases
          </v-btn>
        </v-sheet>

        <v-row>
          <v-col cols="12" md="6">
            <CaseList :cases="appStore.cases" />
          </v-col>
          <v-col cols="12" md="6">
            <v-card>
              <v-card-title>Start new investigation</v-card-title>
              <v-card-text>
                <v-form @submit.prevent="createCase">
                  <v-text-field
                    v-model="newCase.name"
                    label="Case name"
                    required
                    density="comfortable"
                    :rules="[(v) => !!v || 'Name is required']"
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
                    Create case
                  </v-btn>
                </v-form>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-col>
    </v-row>
  </DefaultLayout>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import DefaultLayout from "@/layouts/Default.vue";
import CaseList from "@/components/CaseList.vue";
import { useAppStore } from "@/stores/app";
import { createCase as apiCreateCase } from "@/services/api";

const router = useRouter();
const appStore = useAppStore();

const creating = ref(false);
const newCase = reactive({ name: "", description: "" });

async function createCase() {
  if (!newCase.name.trim()) return;
  creating.value = true;
  try {
    const created = await apiCreateCase(
      newCase.name,
      newCase.description || undefined,
    );
    await appStore.loadCases();
    router.push(`/cases/${created.id}`);
  } finally {
    creating.value = false;
  }
}

onMounted(() => {
  appStore.loadCases();
});
</script>
