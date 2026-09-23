export interface Category {
  id: string;
  slug: string;
  name: string;
  parentId?: string | null;
  children?: Category[];
  description?: string | null;
  imageUrl?: string | null;
}
