import type { Project } from "./types";

const DB_NAME = "storyrail-db";
const STORE_NAME = "projects";
const DB_VERSION = 1;
const LAST_PROJECT_KEY = "last-project-id";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveProject(project: Project): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(project);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  localStorage.setItem(LAST_PROJECT_KEY, project.id);
  database.close();
}

export async function loadLastProject(): Promise<Project | null> {
  const id = localStorage.getItem(LAST_PROJECT_KEY);
  if (!id) return null;
  const database = await openDatabase();
  const project = await new Promise<Project | undefined>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result as Project | undefined);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return project ?? null;
}

export async function deleteProject(id: string): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}
