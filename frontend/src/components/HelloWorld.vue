<template>
  <v-card>
    <v-card-title>TraceVector</v-card-title>
    <v-card-text>
      <p>Local-first forensic log investigation platform.</p>
      <p class="text-medium-emphasis mt-2">Backend status: {{ status }}</p>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import axios from "axios";

const status = ref("checking...");

onMounted(async () => {
  try {
    const response = await axios.get("/api/health");
    status.value = `${response.data.status} (${response.data.version})`;
  } catch {
    status.value = "unreachable";
  }
});
</script>
