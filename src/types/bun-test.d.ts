declare module "bun:test" {
  export const describe: (name: string, fn: () => void) => void
  export const test: (name: string, fn: () => unknown | Promise<unknown>) => void
  export const beforeAll: (fn: () => unknown | Promise<unknown>) => void
  export const afterEach: (fn: () => unknown | Promise<unknown>) => void
  export const expect: any
  export const mock: {
    module: (specifier: string, factory: () => unknown) => void
  }
}

declare module "bun:sqlite" {
  export class Database {
    constructor(path: string)
    exec(sql: string): void
    prepare(sql: string): {
      all(...args: unknown[]): unknown[]
      get(...args: unknown[]): unknown
      run(...args: unknown[]): unknown
    }
    close(): void
  }
}
