import process from 'process';

type GetProcessArgvResult<T extends unknown> = { name: string, value: T }

export function getProcessArgv(name: string): GetProcessArgvResult<string> | null {
  if (!name) return null
  const found: string = process.argv.find(str => str.startsWith(name))
  if (!found) return null
  let value = found.replace(name, '').replace('=', '').trim()
  return {
    name,
    value
  }
}

export function getProcessArgvAndToJson<T extends Record<any, any>>(name: string): GetProcessArgvResult<T> | null {
  const res = getProcessArgv(name)
  if (!res) return null
  try {
    return {
      name,
      value: JSON.parse(res.value)
    }
  } catch (e) {
    return null
  }
}
