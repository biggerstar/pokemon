
export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function toChineseTime(time?: Date | number){
  if (!time) time = Date.now()
  const curZhHansTime = new Date(time)
  curZhHansTime.setHours(curZhHansTime.getHours() + 8)
  return curZhHansTime
}

export function formatConmonTime(time: number | Date){
  return new Date(time).toISOString().replace('T', ' ').replace(/\..+/, '')
}
