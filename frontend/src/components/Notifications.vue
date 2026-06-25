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
  <v-snackbar v-model="show" :color="color" timeout="5000" location="top">
    {{ message }}
    <template #actions>
      <v-btn variant="text" @click="show = false">Close</v-btn>
    </template>
  </v-snackbar>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";

const show = ref(false);
const message = ref("");
const color = ref("error");

function onError(event: Event) {
  const custom = event as CustomEvent<string>;
  message.value = custom.detail || "An error occurred";
  color.value = "error";
  show.value = true;
}

function onSuccess(event: Event) {
  const custom = event as CustomEvent<string>;
  message.value = custom.detail || "Success";
  color.value = "success";
  show.value = true;
}

onMounted(() => {
  window.addEventListener("api-error", onError);
  window.addEventListener("app-success", onSuccess);
});

onUnmounted(() => {
  window.removeEventListener("api-error", onError);
  window.removeEventListener("app-success", onSuccess);
});
</script>
