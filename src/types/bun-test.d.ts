declare module "bun:test" {
  export const describe: (name: string, fn: () => void) => void
  export const test: (name: string, fn: () => unknown | Promise<unknown>) => void
  export const afterEach: (fn: () => unknown | Promise<unknown>) => void
  export const expect: any
}
