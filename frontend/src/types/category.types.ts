export interface Category {
  id: string;
  slug: string;
  name: string;
  parentId?: string;
  children?: Category[];
}
