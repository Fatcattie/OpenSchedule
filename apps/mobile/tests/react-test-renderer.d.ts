/**
 * 职责：react-test-renderer 类型兜底声明。
 * 该包未附带类型且未安装 @types/react-test-renderer；测试仅用到 create / act / root 与相关类型。
 * 采用「默认导出 + 命名空间合并」以同时支持 `TestRenderer.create(...)` 与 `TestRenderer.ReactTestRenderer` 类型引用。
 */
declare module 'react-test-renderer' {
  /** 渲染树中的测试实例（节选，测试所需子集） */
  export interface ReactTestInstance {
    // 组件 props：允许任意读写与调用（测试需读取 onChange / onPress / actions 等）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    props: Record<string, any>
    /** 元素类型：宿主节点为字符串标签，合成组件为函数 / 类 */
    type: unknown
    /** 父实例（根节点为 null） */
    parent: ReactTestInstance | null
    /** 按谓词查找所有匹配实例 */
    findAll(predicate: (node: ReactTestInstance) => boolean): ReactTestInstance[]
    /** 按组件类型查找所有匹配实例 */
    findAllByType(type: unknown): ReactTestInstance[]
    /** 按组件类型查找唯一匹配实例 */
    findByType(type: unknown): ReactTestInstance
  }

  export interface ReactTestRenderer {
    root: ReactTestInstance
    unmount(): void
    update(element: unknown): void
    toJSON(): unknown
  }

  export function act(callback: () => void | Promise<void>): Promise<void> | void

  namespace TestRenderer {
    interface ReactTestInstance {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      props: Record<string, any>
      type: unknown
      parent: ReactTestInstance | null
      findAll(predicate: (node: ReactTestInstance) => boolean): ReactTestInstance[]
      findAllByType(type: unknown): ReactTestInstance[]
      findByType(type: unknown): ReactTestInstance
    }
    interface ReactTestRenderer {
      root: ReactTestInstance
      unmount(): void
      update(element: unknown): void
      toJSON(): unknown
    }
    function create(element: unknown, options?: unknown): ReactTestRenderer
    function act(callback: () => void | Promise<void>): Promise<void> | void
  }

  export default TestRenderer
}
