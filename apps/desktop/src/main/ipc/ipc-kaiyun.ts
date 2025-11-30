import { ipcMain } from "electron";

interface TableStatus {
  id: string | number;
  statusText: string;
  data: Record<string, any>;
  updatedAt: number;
}

class TableDatabase {
  private db: Map<string, TableStatus> = new Map();

  upsert(id: string | number, status: string, data: Record<string, any>) {
    const strId = String(id);
    const existing = this.db.get(strId) || { id: strId, status, data, updatedAt: 0 };
    this.db.set(strId, {
      ...existing,
      statusText: String(status) || '',
      data: { ...existing.data, ...data },
      updatedAt: Date.now()
    });
  }

  get(id: string | number) {
    return this.db.get(String(id));
  }

  getAll() {
    // 按 tableName 排序
    return Array.from(this.db.values()).sort((a, b) => {
      const nameA = a.data?.tableName || '';
      const nameB = b.data?.tableName || '';
      return nameA.localeCompare(nameB);
    });
  }

  clear(ids?: (string | number)[]) {
    if (ids && ids.length > 0) {
      ids.forEach(id => this.db.delete(String(id)));
    } else {
      this.db.clear();
    }
  }

  sync(gameTableMap: Record<string, any>) {
    const incomingIds = new Set<string>();
    
    // console.log('Syncing table data, count:', Object.keys(gameTableMap).length);

    // 更新或新增
    Object.values(gameTableMap).forEach((item: any) => {
      const id = item.tableId;
      if (!id) return;
      const strId = String(id);
      incomingIds.add(strId);
      
      const existing = this.db.get(strId);
      if (existing) {
        // 更新数据
        this.db.set(strId, {
          ...existing,
          data: { ...existing.data, ...item },
          updatedAt: Date.now()
        });
      } else {
        // 新增
        this.db.set(strId, {
          id: strId,
          statusText: String(item.statusText) || '',
          data: item,
          updatedAt: Date.now()
        });
      }
    });

    // 删除不存在的
    let deletedCount = 0;
    for (const id of this.db.keys()) {
      if (!incomingIds.has(id)) {
        this.db.delete(id);
        deletedCount++;
      }
    }
    // console.log('Sync complete. Updated/Added:', incomingIds.size, 'Deleted:', deletedCount);
  }
}

const tableDb = new TableDatabase();

ipcMain.handle('update-table-status', (_, { id, status, data }) => {
  tableDb.upsert(id, status, data);
  return { success: true };
});

ipcMain.handle('update-table-list', (_, gameTableMap: Record<string, any>) => {
  tableDb.sync(gameTableMap);
  return { success: true };
});

ipcMain.handle('get-table-list', () => {
  const items = tableDb.getAll();
  return {
    data: {
      items,
      total: items.length
    }
  };
});

ipcMain.handle('clear-table-list', (_, ids?: string[]) => {
  tableDb.clear(ids);
  return { success: true };
});
