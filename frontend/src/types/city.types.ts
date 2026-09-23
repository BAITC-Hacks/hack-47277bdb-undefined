export interface City {
  id: string;
  slug: string;
  name: string;
}

export interface Branch {
  id: string;
  cityId: string;
  name: string;
  address: string;
  phone?: string;
}
