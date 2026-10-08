// Yalnız geliştirmede tarayıcıda denemek için (ürün Android). SecureStore web'de yok.
export const storage = {
  get: async (key: string) => localStorage.getItem(key),
  set: async (key: string, value: string) => localStorage.setItem(key, value),
  remove: async (key: string) => localStorage.removeItem(key),
};
