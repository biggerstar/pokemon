import { seededRandom } from "./data";

/**
 * 生成随机的种子
 */
export const genRandomSeed = function () {
  return Math.floor(seededRandom(Math.random() * 1e6, Number.MAX_SAFE_INTEGER, 1))
}

/**
 * 字符串的number类型hash
 */
export const hashNumberFromString = (input: string): number => {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    let char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash % Number.MAX_SAFE_INTEGER);
}
