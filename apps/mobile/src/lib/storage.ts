import * as SecureStore from "expo-secure-store";

// Yenileme belirteci cihazın güvenli deposunda (Android Keystore). Web karşılığı storage.web.ts.
export const storage = {
  get: (key: string) => SecureStore.getItemAsync(key),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  remove: (key: string) => SecureStore.deleteItemAsync(key),
};
