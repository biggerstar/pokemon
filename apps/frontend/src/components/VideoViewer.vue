<script lang="ts" setup>
import { Button, Checkbox, message } from 'ant-design-vue';
import { computed, nextTick, ref, watch } from 'vue';

const { options } = defineProps({
  options: {
    type: Object,
    default: () => ({ videos: [] })
  }
})

// 选中状态：{ [分组名]: Set<index> }
const selected = ref<Record<string, Set<number>>>({})

// 记录每个视频的重试次数
const retryCount = ref<Record<string, number>>({})

// 初始化选中状态
watch(
  () => options,
  (val) => {
    const result: Record<string, Set<number>> = {}
    for (const group of val.videos || []) {
      result[group.name] = new Set(group.urls.map((_: any, idx: number) => idx))
    }
    selected.value = result
  },
  { immediate: true, deep: true }
)

// 选中/取消单个视频
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

// 计算所有选中视频 [{ src, name }]
const selectedVideos = computed(() => {
  const result: { src: string, name: string }[] = []
  for (const group of options.videos || []) {
    const set = selected.value[group.name]
    if (!set) continue
    let count = 1
    group.urls.forEach((video: any, idx: number) => {
      if (set.has(idx)) {
        let fileName = video.name
        if (!fileName) {
          // 没有 name 用 分组名-序号
          fileName = `${group.name}-${count}`
        }
        // 保证扩展名
        if (!/\.[a-zA-Z0-9]+$/.test(fileName)) {
          // 尝试从 src 提取
          const ext = video.src.split('.').pop()?.split(/\?|#/)[0] || 'mp4'
          fileName += '.' + ext
        }
        result.push({ src: fixUrl(video.src), name: fileName })
        count++
      }
    })
  }
  return result
})

// 下载单个视频
async function downloadVideo(video: { src: string, name: string }) {
  try {
    message.info(`正在下载: ${video.name}`)
    const response = await fetch(fixUrl(video.src))
    if (!response.ok) throw new Error('视频下载失败')

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = video.name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    message.success(`视频 ${video.name} 下载成功`)
  } catch (error) {
    message.error(`视频 ${video.name} 下载失败: ${error}`)
  }
}

// 批量下载选中的视频
async function downloadSelectedVideos() {
  if (selectedVideos.value.length === 0) {
    message.warning('请先选择要下载的视频')
    return false
  }

  message.info(`开始下载 ${selectedVideos.value.length} 个视频文件`)

  for (const video of selectedVideos.value) {
    await downloadVideo(video)
    // 添加小延迟避免浏览器限制
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  message.success('所有选中的视频下载完成')
  return true
}

// 处理视频加载失败，自动重试
function handleVideoError(groupName: string, idx: number, video: any) {
  const key = `${groupName}-${idx}`
  if (!retryCount.value[key]) retryCount.value[key] = 0
  if (retryCount.value[key] < 3) {
    retryCount.value[key]++
    // 强制刷新视频，添加时间戳参数
    video.src += (video.src.includes('?') ? '&' : '?') + 'retry=' + Date.now()
    video.src = fixUrl(video.src)
    // 触发视图刷新
    nextTick()
  } else {
    // 超过3次，显示加载失败
    video.loadFailed = true
  }
}

// URL 修正函数
function fixUrl(url: string) {
  if (url && url.startsWith('//')) {
    return 'https:' + url
  }
  return url
}

// 暴露方法给父组件
defineExpose({
  downloadSelectedVideos,
  selectedVideos
})
</script>

<template>
  <div>
    <div v-for="group in options.videos" :key="group.name" style="margin-bottom: 24px;">
      <div style="display: flex; align-items: center; margin-bottom: 8px;">
        <b style="font-size: 16px;">{{ group.name }}</b>
        <Button size="small" type="link" style="margin-left: 12px;" @click="toggleSelectAll(group)">
          {{ isAllSelected(group) ? '全不选' : '全选' }}
        </Button>
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: 16px;">
        <div v-for="(video, idx) in group.urls" :key="video.src + idx" style="width: 200px; text-align: center;">
          <div v-if="!video.loadFailed" style="position: relative;">
            <video
              :src="fixUrl(video.src)"
              :alt="video.name || `${group.name}-${idx + 1}`"
              style="width: 180px; height: 120px; object-fit: cover; border-radius: 6px;"
              controls
              preload="metadata"
              @error="() => handleVideoError(group.name, idx, video)"
            />
            <!-- <Button
              size="small"
              type="primary"
              style="position: absolute; top: 8px; right: 8px;"
              @click="() => downloadVideo({ src: video.src, name: video.name || `${group.name}-${idx + 1}` })"
            >
              下载
            </Button> -->
          </div>
          <div v-else style="display: flex; align-items: center; justify-content: center; width: 180px; height: 120px; background: #f5f5f5; border-radius: 6px;">
            <span style="color: #999;">加载失败</span>
          </div>
          <div style="margin-top: 4px;">
            <Checkbox :checked="selected[group.name]?.has(idx)" @change="() => toggleSelect(group.name, idx)">
              {{ video.name || `${group.name}-${idx + 1}` }}
            </Checkbox>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
video {
  border: 1px solid #d9d9d9;
}

video:hover {
  border-color: #1890ff;
}
</style>
