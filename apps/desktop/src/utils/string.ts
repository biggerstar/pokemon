

type generateRandomStringOptions = {
  /**  自定义字符集 (默认包含大小写字母和数字) */
  charset?: string;
};

export function generateRandomString(
  length: number,
  options: generateRandomStringOptions = {}
) {
  const { charset } = options;

  // 默认字符集：大小写字母 + 数字（排除易混淆字符）
  const defaultCharset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz123456789'
  const chars = charset || defaultCharset;
  const maxIndex = chars.length;

  // 创建随机字节容器
  const randomBytes = new Uint8Array(length);

  for (let i = 0; i < length; i++) {
    randomBytes[i] = Math.floor(Math.random() * 256);
  }

  // 生成字符串
  return Array.from(randomBytes, (byte) => chars[byte % maxIndex]).join('');
}

/**
 * 生成指定个数的随机数字
 * @param {number} count - 要生成的数字个数
 * @param {number} [min=0] - 最小值（包含）
 * @param {number} [max=9] - 最大值（包含）
 * @returns {number[]} 包含随机数字的数组
 */
export function generateRandomNumbers(count = 32, min = 0, max = 9) {
  // 参数校验
  if (count <= 0) {
    throw new Error('个数必须大于0');
  }
  if (min > max) {
    throw new Error('最小值不能大于最大值');
  }

  const result = [];
  for (let i = 0; i < count; i++) {
    // 生成min到max之间的随机整数
    const randomNum = Math.floor(Math.random() * (max - min + 1)) + min;
    result.push(randomNum);
  }

  return result.join('');
}
