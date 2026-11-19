let recoveryGuardInstalled = false
let consoleSuppressionDepth = 0
let suppressedOriginalError: typeof console.error | null = null
let suppressedOriginalWarn: typeof console.warn | null = null
const STALE_AUTH_PATTERNS = [
  'invalid refresh token',
  'refresh token not found',
  'refresh_token_not_found',
  'jwt expired',
  'jwt has expired',
  'invalid jwt',
  'invalid claim: missing sub claim',
  'user from sub claim in jwt does not exist',
]

export function authErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return String(error || '')
}

export function isStaleSupabaseAuthError(error: unknown): boolean {
  const message = authErrorMessage(error).toLowerCase()
  return STALE_AUTH_PATTERNS.some((pattern) => message.includes(pattern))
}

export function clearSupabaseAuthStorage() {
  if (typeof window === 'undefined') return
  const clear = (storage: Storage) => {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index)
      if (key && key.startsWith('sb-') && key.includes('auth-token')) {
        storage.removeItem(key)
      }
    }
  }

  try { clear(window.localStorage) } catch {}
  try { clear(window.sessionStorage) } catch {}
}

function hasStaleSupabaseAuthError(args: unknown[]): boolean {
  return args.some(isStaleSupabaseAuthError)
}

function startStaleAuthConsoleSuppression() {
  if (consoleSuppressionDepth === 0) {
    suppressedOriginalError = console.error
    suppressedOriginalWarn = console.warn

    console.error = (...args: unknown[]) => {
      if (!hasStaleSupabaseAuthError(args)) suppressedOriginalError?.(...args)
    }
    console.warn = (...args: unknown[]) => {
      if (!hasStaleSupabaseAuthError(args)) suppressedOriginalWarn?.(...args)
    }
  }

  consoleSuppressionDepth += 1
}

function stopStaleAuthConsoleSuppression() {
  if (consoleSuppressionDepth === 0) return

  consoleSuppressionDepth -= 1
  if (consoleSuppressionDepth > 0) return

  if (suppressedOriginalError) console.error = suppressedOriginalError
  if (suppressedOriginalWarn) console.warn = suppressedOriginalWarn
  suppressedOriginalError = null
  suppressedOriginalWarn = null
}

export async function withStaleAuthConsoleSuppressed<T>(operation: () => Promise<T>): Promise<T> {
  if (process.env.NODE_ENV !== 'development') return operation()

  startStaleAuthConsoleSuppression()

  try {
    return await operation()
  } finally {
    stopStaleAuthConsoleSuppression()
  }
}

export function installStaleSupabaseAuthRecoveryGuard() {
  if (typeof window === 'undefined' || recoveryGuardInstalled) return
  recoveryGuardInstalled = true

  if (process.env.NODE_ENV === 'development') {
    const originalError = console.error
    const originalWarn = console.warn

    console.error = (...args: unknown[]) => {
      if (hasStaleSupabaseAuthError(args)) {
        clearSupabaseAuthStorage()
        return
      }
      originalError(...args)
    }

    console.warn = (...args: unknown[]) => {
      if (hasStaleSupabaseAuthError(args)) {
        clearSupabaseAuthStorage()
        return
      }
      originalWarn(...args)
    }
  }

  window.addEventListener('unhandledrejection', (event) => {
    if (!isStaleSupabaseAuthError(event.reason)) return
    clearSupabaseAuthStorage()
    if (process.env.NODE_ENV === 'development') event.preventDefault()
  })

  window.addEventListener('error', (event) => {
    if (!isStaleSupabaseAuthError(event.error || event.message)) return
    clearSupabaseAuthStorage()
    if (process.env.NODE_ENV === 'development') event.preventDefault()
  })
}
