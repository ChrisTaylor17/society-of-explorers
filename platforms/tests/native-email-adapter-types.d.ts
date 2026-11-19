// Narrow compile fixture for the platform-independent adapter/Spec boundary.
// These names are substitutes only; this is not React Native or Codegen proof.
declare module 'react-native' {
  export type TurboModule = Record<never, never>;
  export namespace CodegenTypes {
    export type EventEmitter<T> = (listener: (event: T) => void) => { remove(): void };
  }
  export const TurboModuleRegistry: { get<T>(name: string): T | null };
  export const Platform: { OS: string };
}
