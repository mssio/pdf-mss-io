export type MergeItem = { id: string; file: File };

export type MergeAction =
  | { type: "add"; items: MergeItem[] }
  | { type: "move"; id: string; offset: -1 | 1 }
  | { type: "remove"; id: string }
  | { type: "clear" };

export function toMergeItems(files: File[], makeId: () => string = () => crypto.randomUUID()): MergeItem[] {
  return files.map((file) => ({ id: makeId(), file }));
}

/** The Merge tool's file list. Moves past either end return the same array. */
export function mergeListReducer(state: MergeItem[], action: MergeAction): MergeItem[] {
  switch (action.type) {
    case "add":
      return [...state, ...action.items];
    case "remove":
      return state.filter((item) => item.id !== action.id);
    case "move": {
      const from = state.findIndex((item) => item.id === action.id);
      const to = from + action.offset;
      if (from < 0 || to < 0 || to >= state.length) return state;
      const next = [...state];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    }
    case "clear":
      return [];
  }
}
