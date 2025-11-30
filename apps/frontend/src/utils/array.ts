export function flattenTree<T extends Record<string, any>>(arr: T[]): T[] {
  const result: T[] = [];

  function traverse(node: any) {
    if (!node) return;
    // 将当前节点加入结果
    result.push(node);
    // 递归处理子节点（假设子节点存储在 children 属性中）
    if (node.children && node.children.length > 0) {
      node.children.forEach((child: any) => traverse(child));
    }
  }

  arr.forEach((item) => traverse(item));
  return result.flat(Infinity);
}
