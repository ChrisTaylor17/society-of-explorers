// Narrow screen/adapter compile fixture. These primitives substitute React Native;
// this does not attest native rendering, accessibility behavior, Codegen or Kotlin.
declare module 'react-native' {
  import type { ComponentType, ReactNode } from 'react';
  type ViewProps = { children?: ReactNode; [name: string]: unknown };
  export const Pressable: ComponentType<ViewProps>;
  export const SafeAreaView: ComponentType<ViewProps>;
  export const ScrollView: ComponentType<ViewProps>;
  export const Text: ComponentType<ViewProps>;
  export const View: ComponentType<ViewProps>;
  export const StyleSheet: { create<T>(styles: T): T };
  export const AppState: {
    currentState: string | null;
    addEventListener(name: 'change' | 'focus' | 'blur', listener: (value: string) => void): { remove(): void };
  };
  export type TurboModule = Record<never, never>;
  export namespace CodegenTypes {
    export type EventEmitter<T> = (listener: (event: T) => void) => { remove(): void };
  }
  export const TurboModuleRegistry: { get<T>(name: string): T | null };
  export const Platform: { OS: string };
}
