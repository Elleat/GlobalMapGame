const DATABASE_NAME = 'global-map-assets';
const STORE_NAME = 'maps';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Не удалось открыть хранилище карт.'));
  });
}

function getImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Выбранный файл не удалось прочитать как изображение.'));
    };
    image.src = url;
  });
}

export async function saveMapAsset(file: File): Promise<{ id: string; width: number; height: number }> {
  if (!file.type.startsWith('image/')) throw new Error('Для карты необходимо выбрать изображение.');
  return saveMapBlob(file);
}

export async function saveMapBlob(blob: Blob): Promise<{ id: string; width: number; height: number }> {
  if (!blob.type.startsWith('image/')) throw new Error('Данные карты не являются изображением.');
  const dimensions = await getImageDimensions(blob);
  const database = await openDatabase();
  const id = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `map_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(blob, id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Не удалось сохранить карту.'));
  });
  database.close();
  return { id, ...dimensions };
}

export async function loadMapAssetUrl(id: string): Promise<string | null> {
  const blob = await loadMapAssetBlob(id);
  return blob ? URL.createObjectURL(blob) : null;
}

export async function loadMapAssetBlob(id: string): Promise<Blob | null> {
  const database = await openDatabase();
  const blob = await new Promise<Blob | undefined>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result as Blob | undefined);
    request.onerror = () => reject(request.error ?? new Error('Не удалось загрузить карту.'));
  });
  database.close();
  return blob ?? null;
}

export async function deleteMapAsset(id: string | null | undefined): Promise<void> {
  if (!id) return;
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Не удалось удалить старую карту.'));
  });
  database.close();
}
