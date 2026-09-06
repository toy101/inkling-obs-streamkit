const STORAGE_KEY = "inkling:selected-player-id";

type Listener = (playerId: string | null) => void;

const listeners = new Set<Listener>();

export function getSelectedPlayerId(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setSelectedPlayerId(playerId: string): void {
  localStorage.setItem(STORAGE_KEY, playerId);

  // Debug画面など、同一window内のOverlayにも通知
  for (const listener of listeners) {
    listener(playerId);
  }
}

export function subscribeSelectedPlayerId(listener: Listener): () => void {
  listeners.add(listener);

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) {
      return;
    }

    listener(event.newValue);
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}
