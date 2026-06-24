<template>
  <v-app>
    <v-app-bar title="TraceVector" color="primary" density="compact" />
    <v-main>
      <v-container>
        <HelloWorld />
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import HelloWorld from "./components/HelloWorld.vue";
</script>
