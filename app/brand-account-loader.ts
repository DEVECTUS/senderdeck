// Keep late account reads from replacing another brand or a newer refresh.
export function createBrandAccountLoader<T>(read: (brandId: string) => Promise<T[]>) {
  let selected = "", revision = 0;
  return {
    select(brandId: string) { selected = brandId; revision++; },
    async refresh(brandId: string): Promise<T[] | null> {
      if (!brandId || brandId !== selected) return null;
      const request = ++revision;
      const current = () => selected === brandId && revision === request;
      try {
        const accounts = await read(brandId);
        return current() ? accounts : null;
      } catch (error) {
        if (current()) throw error;
        return null;
      }
    },
  };
}
