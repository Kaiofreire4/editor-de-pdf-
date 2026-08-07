import { Injectable } from '@angular/core';

export interface LocalPdfRecord {
  id: string;
  name: string;
  createdAt: number;
  size: number;
  blob: Blob;
}

@Injectable({ providedIn: 'root' })
export class LocalPdfStorageService {
  private readonly databaseName = 'pdfmaster-local-files';
  private readonly storeName = 'edited-pdfs';
  private databasePromise?: Promise<IDBDatabase>;

  async savePdf(blob: Blob, name: string): Promise<LocalPdfRecord> {
    const record: LocalPdfRecord = {
      id: crypto.randomUUID(),
      name,
      createdAt: Date.now(),
      size: blob.size,
      blob,
    };
    const database = await this.openDatabase();
    await this.runRequest(database, 'readwrite', (store) => store.put(record));
    return record;
  }

  async listPdfs(): Promise<LocalPdfRecord[]> {
    const database = await this.openDatabase();
    const records = await this.runRequest<LocalPdfRecord[]>(database, 'readonly', (store) => store.getAll());
    return records.sort((a, b) => b.createdAt - a.createdAt);
  }

  async deletePdf(id: string): Promise<void> {
    const database = await this.openDatabase();
    await this.runRequest(database, 'readwrite', (store) => store.delete(id));
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 1);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(this.storeName)) {
          database.createObjectStore(this.storeName, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
    });
    return this.databasePromise;
  }

  private runRequest<T = undefined>(
    database: IDBDatabase,
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(this.storeName, mode);
      const request = operation(transaction.objectStore(this.storeName));
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as T);
    });
  }
}
