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
  <v-app-bar color="primary" density="compact" flat>
    <template #prepend>
      <v-app-bar-nav-icon @click="drawer = !drawer" />
    </template>

    <v-app-bar-title>
      <router-link to="/" class="text-white text-decoration-none">
        TraceVector
      </router-link>
    </v-app-bar-title>

    <v-chip
      v-if="appStore.currentCaseName"
      class="ml-4"
      size="small"
      variant="flat"
      color="secondary"
    >
      {{ appStore.currentCaseName }}
    </v-chip>
    <v-chip
      v-if="appStore.currentTimelineName"
      class="ml-2"
      size="small"
      variant="outlined"
      color="white"
    >
      {{ appStore.currentTimelineName }}
    </v-chip>

    <v-spacer />

    <v-btn icon to="/" title="Home">
      <v-icon>mdi-home</v-icon>
    </v-btn>
    <v-btn icon to="/cases" title="Cases">
      <v-icon>mdi-briefcase</v-icon>
    </v-btn>
  </v-app-bar>

  <v-navigation-drawer v-model="drawer" temporary>
    <v-list nav>
      <v-list-item to="/" title="Home" prepend-icon="mdi-home" />
      <v-list-item to="/cases" title="Cases" prepend-icon="mdi-briefcase" />
      <v-divider class="my-2" />
      <v-list-subheader>Recent cases</v-list-subheader>
      <v-list-item
        v-for="caseItem in appStore.cases.slice(0, 10)"
        :key="caseItem.id"
        :to="`/cases/${caseItem.id}`"
        :title="caseItem.name"
        prepend-icon="mdi-folder-open"
      />
    </v-list>
  </v-navigation-drawer>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useAppStore } from "@/stores/app";

const appStore = useAppStore();
const drawer = ref(false);
</script>
