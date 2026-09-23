export interface City {
  id: string;
  slug: string;
  name: string;
}

export interface Branch {
  id: string;
  cityId: string;
  name: string;
  address: string | null;
  phone1: string | null;
  phone2: string | null;
  email: string | null;
  workingHours: string | null;
  latitude: number | null;
  longitude: number | null;
  city?: City;
}
