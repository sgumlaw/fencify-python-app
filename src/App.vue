<script setup lang="ts">
import { ref } from 'vue'
import { uploadBlueprint, processBlueprint, type ProcessPrompt } from './api'

const uploading = ref(false)
const processing = ref(false)
const error = ref<string | null>(null)

const blueprintId = ref<string | null>(null)
const originalUrl = ref<string | null>(null)
const processedUrl = ref<string | null>(null)

// form controls
const color = ref('#FFCC00') // default highlight color
const target = ref<'fence' | 'walls' | string>('fence') // default to fence

async function onUpload(e: Event) {
  error.value = null
  processedUrl.value = null

  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  try {
    uploading.value = true
    const res = await uploadBlueprint(file)
    blueprintId.value = res.id
    originalUrl.value = res.url
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    error.value = err?.message ?? String(err)
  } finally {
    uploading.value = false
  }
}

async function onProcess() {
  if (!blueprintId.value) {
    error.value = 'Upload a blueprint first.'
    return
  }

  const prompt: ProcessPrompt = { type: 'highlight', target: target.value, color: color.value }
  try {
    processing.value = true
    error.value = null
    const res = await processBlueprint(blueprintId.value, prompt)
    processedUrl.value = res.url ?? null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    error.value = err?.message ?? String(err)
  } finally {
    processing.value = false
  }
}
</script>

<template>
  <main class="max-w-4xl mx-auto p-6 space-y-6">
    <h1 class="text-2xl font-semibold">Fencify – Blueprint Processor</h1>

    <section class="space-y-3">
      <label class="block font-medium">Upload blueprint (PDF/PNG/JPG)</label>
      <input type="file" accept=".pdf,image/*" @change="onUpload" />
      <p v-if="uploading" class="text-sm text-gray-500">Uploading…</p>
      <p v-if="originalUrl" class="text-sm text-green-600">Uploaded ✔</p>
    </section>

    <section v-if="originalUrl" class="grid md:grid-cols-2 gap-6 items-start">
      <div>
        <h2 class="font-medium mb-2">Original</h2>
        <img :src="originalUrl!" alt="original" class="border rounded w-full" />
      </div>

      <div class="space-y-4">
        <div>
          <h2 class="font-medium mb-2">Processing options</h2>
          <div class="flex items-center gap-3">
            <label class="text-sm">Target:</label>
            <select v-model="target" class="border rounded px-2 py-1">
              <option value="fence">Fence (× pattern)</option>
              <option value="walls">Walls (generic edges)</option>
            </select>

            <label class="text-sm">Color:</label>
            <input v-model="color" type="color" class="h-8 w-12 cursor-pointer" />
          </div>
        </div>

        <button
          class="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
          :disabled="processing"
          @click="onProcess"
        >
          {{ processing ? 'Processing…' : 'Run highlight' }}
        </button>

        <div v-if="processedUrl">
          <h2 class="font-medium mb-2">Processed</h2>
          <template v-if="/\.png$/i.test(processedUrl)">
            <img :src="processedUrl!" alt="processed" class="border rounded w-full" />
          </template>
          <template v-else>
            <a :href="processedUrl!" target="_blank" class="text-blue-600 underline"
              >View processed JSON</a
            >
          </template>
        </div>
      </div>
    </section>

    <p v-if="error" class="text-red-600">{{ error }}</p>
  </main>
</template>

<style>
/* basic styles; Tailwind optional */
</style>
