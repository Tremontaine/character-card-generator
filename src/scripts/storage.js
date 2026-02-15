// IndexedDB storage for prompts and generated cards
class CharacterStorage {
  constructor() {
    this.dbName = "characterGeneratorDB";
    this.dbVersion = 1;
    this.db = null;
  }

  async init() {
    if (this.db) return this.db;

    this.db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains("prompts")) {
          const promptStore = db.createObjectStore("prompts", {
            keyPath: "id",
            autoIncrement: true,
          });
          promptStore.createIndex("updatedAt", "updatedAt", { unique: false });
        }

        if (!db.objectStoreNames.contains("cards")) {
          const cardStore = db.createObjectStore("cards", {
            keyPath: "id",
            autoIncrement: true,
          });
          cardStore.createIndex("updatedAt", "updatedAt", { unique: false });
        }
      };
    });

    return this.db;
  }

  async run(storeName, mode, operation) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);

      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(tx.error || new Error("IndexedDB transaction aborted"));

      let request;
      try {
        request = operation(store);
      } catch (error) {
        reject(error);
        return;
      }

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  withTimestamps(record) {
    const now = new Date().toISOString();
    const createdAt = record.createdAt || now;
    return {
      ...record,
      createdAt,
      updatedAt: now,
    };
  }

  sanitizeRecordForPut(record) {
    const sanitized = this.withTimestamps(record);

    // For inline auto-increment keyPath stores, an invalid `id` causes DataError.
    // Remove id unless it is a valid integer key from an existing record.
    if (!Number.isInteger(sanitized.id) || sanitized.id <= 0) {
      delete sanitized.id;
    }

    return sanitized;
  }

  async savePrompt(promptRecord) {
    const record = this.sanitizeRecordForPut(promptRecord);
    return this.run("prompts", "readwrite", (store) => store.put(record));
  }

  async listPrompts() {
    const rows = await this.run("prompts", "readonly", (store) =>
      store.getAll(),
    );
    return rows.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  async getPrompt(id) {
    return this.run("prompts", "readonly", (store) => store.get(id));
  }

  async deletePrompt(id) {
    return this.run("prompts", "readwrite", (store) => store.delete(id));
  }

  async saveCard(cardRecord) {
    const record = this.sanitizeRecordForPut(cardRecord);
    return this.run("cards", "readwrite", (store) => store.put(record));
  }

  async listCards() {
    const rows = await this.run("cards", "readonly", (store) => store.getAll());
    return rows.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  async getCard(id) {
    return this.run("cards", "readonly", (store) => store.get(id));
  }

  async deleteCard(id) {
    return this.run("cards", "readwrite", (store) => store.delete(id));
  }
}

window.characterStorage = new CharacterStorage();
