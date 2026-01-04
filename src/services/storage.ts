import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Cell } from '../types';

export interface NotebookMeta {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
}

export interface NotebookContent {
    id: string;
    cells: Cell[];
}

interface LogosEngineDB extends DBSchema {
    meta: {
        key: string;
        value: NotebookMeta;
    };
    notebooks: {
        key: string;
        value: NotebookContent;
    };
}

const DB_NAME = 'logos-engine-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<LogosEngineDB>> | null = null;

export const getDB = () => {
    if (!dbPromise) {
        dbPromise = openDB<LogosEngineDB>(DB_NAME, DB_VERSION, {
            upgrade(db) {
                db.createObjectStore('meta', { keyPath: 'id' });
                db.createObjectStore('notebooks', { keyPath: 'id' });
            },
        });
    }
    return dbPromise;
};

export const storage = {
    async getAllMeta(): Promise<NotebookMeta[]> {
        const db = await getDB();
        return db.getAll('meta');
    },

    async getNotebook(id: string): Promise<NotebookContent | undefined> {
        const db = await getDB();
        return db.get('notebooks', id);
    },

    async saveNotebook(meta: NotebookMeta, content: NotebookContent): Promise<void> {
        const db = await getDB();
        const tx = db.transaction(['meta', 'notebooks'], 'readwrite');
        await Promise.all([
            tx.objectStore('meta').put(meta),
            tx.objectStore('notebooks').put(content),
            tx.done
        ]);
    },

    async deleteNotebook(id: string): Promise<void> {
        const db = await getDB();
        const tx = db.transaction(['meta', 'notebooks'], 'readwrite');
        await Promise.all([
            tx.objectStore('meta').delete(id),
            tx.objectStore('notebooks').delete(id),
            tx.done
        ]);
    },

    async updateMeta(meta: NotebookMeta): Promise<void> {
        const db = await getDB();
        await db.put('meta', meta);
    }
};


