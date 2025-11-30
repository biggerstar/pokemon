<script lang="ts" setup>
import { Button, Checkbox, Image, message } from 'ant-design-vue'
import JSZip from 'jszip'
import { computed, nextTick, ref, watch } from 'vue'

const { options } = defineProps({
  options: {
    type: Object,
    default: () => ({ images: [] })
  }
})

// 选中状态：{ [分组名]: Set<index> }
const selected = ref<Record<string, Set<number>>>({})

// 新增：记录每张图片的重试次数
const retryCount = ref<Record<string, number>>({})

// 初始化选中状态
watch(
  () => options,
  (val) => {
    const result: Record<string, Set<number>> = {}
    for (const group of val.images || []) {
      result[group.name] = new Set(group.urls.map((_: any, idx: number) => idx))
    }
    selected.value = result
  },
  { immediate: true, deep: true }
)

// 选中/取消单张图片
function toggleSelect(groupName: string, idx: number) {
  const set = selected.value[groupName] as Set<number>
  if (set.has(idx)) set.delete(idx)
  else set.add(idx)
}

// 分组全选/全不选
function toggleSelectAll(group: any) {
  const set = selected.value[group.name] as Set<number>
  if (set.size === group.urls.length) set.clear()
  else {
    set.clear()
    group.urls.forEach((_: any, idx: number) => set.add(idx))
  }
}

// 判断分组是否全选
function isAllSelected(group: any) {
  return selected.value[group.name]?.size === group.urls.length
}

// 计算所有选中图片 [{ src, name }]
const selectedImages = computed(() => {
  const result: { src: string, name: string }[] = []
  for (const group of options.images || []) {
    const set = selected.value[group.name]
    if (!set) continue
    let count = 1
    group.urls.forEach((img: any, idx: number) => {
      if (set.has(idx)) {
        let fileName = img.name
        if (!fileName) {
          // 没有 name 用 分组名-序号
          fileName = `${group.name}-${count}`
        }
        // 保证扩展名
        if (!/\.[a-zA-Z0-9]+$/.test(fileName)) {
          // 尝试从 src 提取
          const ext = img.src.split('.').pop()?.split(/\?|#/)[0] || 'jpg'
          fileName += '.' + ext
        }
        result.push({ src: fixUrl(img.src), name: fileName })
        count++
      }
    })
  }
  return result
})

// 下载图片为 blob
async function fetchImageAsBlob(url: string): Promise<Blob> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('图片下载失败: ' + url)
  return await res.blob()
}

// 导出 zip
async function exportZip() {
  if (selectedImages.value.length === 0) {
    message.warning('请先选择要导出的图片')
    return false
  }
  const zip = new JSZip()
  message.info('正在打包图片，请稍候...')
  let failed = 0
  for (const img of selectedImages.value) {
    try {
      const blob = await fetchImageAsBlob(fixUrl(img.src))
      zip.file(img.name, blob)
    } catch (e) {
      failed++
    }
  }
  const content = await zip.generateAsync({ type: 'blob' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(content)
  a.download = options.fileName || 'images.zip'
  a.click()
  URL.revokeObjectURL(a.href)
  if (failed > 0) {
    message.warning(`有 ${failed} 张图片下载失败，未包含在压缩包中`)
  } else {
    message.success('图片已成功导出为 zip')
  }
  return true
}

// 处理图片加载失败，自动重试
function handleImgError(groupName: string, idx: number, img: any) {
  const key = `${groupName}-${idx}`
  if (!retryCount.value[key]) retryCount.value[key] = 0
  if (retryCount.value[key] < 3) {
    retryCount.value[key]++
    // 强制刷新图片，添加时间戳参数
    img.src += (img.src.includes('?') ? '&' : '?') + 'retry=' + Date.now()
    img.src = fixUrl(img.src)
    // 触发视图刷新
    nextTick()
  } else {
    // 超过3次，显示加载失败
    img.loadFailed = true
  }
}

// 新增：URL 修正函数
function fixUrl(url: string) {
  if (url && url.startsWith('//')) {
    return 'https:' + url
  }
  return url
}

// 暴露方法给父组件
defineExpose({
  exportZip,
  selectedImages
})
</script>

<template>
  <div>
    <div v-for="group in options.images" :key="group.name" style="margin-bottom: 24px;">
      <div style="display: flex; align-items: center; margin-bottom: 8px;">
        <b style="font-size: 16px;">{{ group.name }}</b>
        <Button size="small" type="link" style="margin-left: 12px;" @click="toggleSelectAll(group)">
          {{ isAllSelected(group) ? '全不选' : '全选' }}
        </Button>
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: 16px;">
        <div v-for="(img, idx) in group.urls" :key="img.src + idx" style="width: 120px; text-align: center;">
          <Image
            v-if="!img.loadFailed"
            :src="fixUrl(img.src)"
            :fallback="fixUrl(img.src)"
            :alt="img.name || `${group.name}-${idx + 1}`"
            style="width: 100px; height: 100px; object-fit: cover; border-radius: 6px;"
            :preview="true"
            @error="() => handleImgError(group.name, idx, img)"
          />
          <div v-else style=" display: flex; align-items: center; justify-content: center;width: 100px; height: 100px; background: #f5f5f5; border-radius: 6px;">
            <span style="color: #999;">加载失败</span>
          </div>
          <div style="margin-top: 4px;">
            <Checkbox :checked="selected[group.name]?.has(idx)" @change="() => toggleSelect(group.name, idx)">
              {{ img.name || `${group.name}-${idx + 1}` }}
            </Checkbox>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.ant-image-preview-root .ant-image-preview-operations {
  margin-top: 30px;
}
</style>
