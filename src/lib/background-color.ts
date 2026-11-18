export const BACKGROUND_STORAGE_KEY = "background-color";

export function resetBackgroundColor() {
  window.localStorage.removeItem(BACKGROUND_STORAGE_KEY);
  document.documentElement.style.removeProperty("--custom-background");
}
